# CapsLock 短按触发高频录音状态振荡 — 竞态 Bug 分析与修复

**日期**：2026-04-15  
**严重级别**：高（功能性 Bug，影响核心语音输入体验）  
**状态**：已修复

---

## 一、问题现象

用户短按（< 0.3s）CapsLock 键时，会出现录音状态的高频来回切换：

- 录音 Loading UI 快速闪烁出现 / 消失
- CapsLock LED 灯来回切换
- 偶发：短按后系统进入持续录音状态（无法通过松键停止）

正常预期行为：短按应被静默取消，补发一次 CapsLock 给系统（保证大写锁定切换功能正常），整个过程对用户透明。

---

## 二、问题产生背景

本项目（Kiri Desktop Pet）集成了 CapsWriter-Offline 的语音识别客户端，使用 pynput 的 `win32_event_filter` 低级钩子监听 CapsLock 键。

配置为：
```python
# config_client.py
shortcuts = [{
    'key': 'caps_lock',
    'suppress': True,   # 阻断按键，不传给系统
    'hold_mode': True,  # 长按模式：按下开始录音，松开停止
    'threshold': 0.3    # 短于 0.3s 视为误触，取消录音并补发按键
}]
```

`suppress=True` 表示 CapsLock 的原始事件被拦截，不传给系统（防止意外切换大写）。短按取消时需要补发一次 CapsLock，使大写锁定正常切换。

---

## 三、发现过程

### 3.1 初步观察

用户反馈：短按 CapsLock 时会触发"奇怪的高频来回切换"。

初步猜测方向：
1. UDP 状态事件的连续触发导致 UI 振荡
2. Windows 对 CapsLock 的 toggle 特殊处理导致额外事件
3. 补发逻辑本身产生了多次 CapsLock 切换

### 3.2 代码审计

阅读整个快捷键处理链：

```
用户按键 → win32_event_filter → handle_keydown/keyup → ShortcutTask → emulate_key
```

关键文件：
- [`util/client/shortcut/shortcut_manager.py`](../CapsWriter-Offline/util/client/shortcut/shortcut_manager.py) — win32_event_filter、防自捕获
- [`util/client/shortcut/event_handler.py`](../CapsWriter-Offline/util/client/shortcut/event_handler.py) — 短按处理逻辑
- [`util/client/shortcut/emulator.py`](../CapsWriter-Offline/util/client/shortcut/emulator.py) — 按键补发
- [`util/client/shortcut/task.py`](../CapsWriter-Offline/util/client/shortcut/task.py) — 录音任务状态

### 3.3 防自捕获机制分析

代码中存在防止补发的按键被自己再次捕获的机制：

```python
# emulator.py
def emulate_key(self, key_name):
    self._emulating_keys.add(key_name)   # [A] 标记：正在模拟
    controller.press(key_obj)            # [B] 补发 KEYDOWN
    controller.release(key_obj)          # [C] 补发 KEYUP

# shortcut_manager.py — win32_event_filter
def _check_emulating(key_name, msg):
    if key_name not in self._emulating_keys:
        return False   # 不是补发的，正常处理
    if msg == WM_KEYUP:
        self._emulating_keys.discard(key_name)  # 松开时清除标志
    return True  # 放行，不触发 handle_keydown/keyup
```

设计意图：[A] 在 [B] 之前执行，所以补发的 KEYDOWN 到达钩子时，标志已经在集合里了，可以被正确放行。

### 3.4 发现竞态窗口

`emulate_key` 是通过 `ThreadPoolExecutor.submit()` 异步提交的：

```python
# event_handler.py — _handle_short_press()
task.cancel()
self.pool.submit(self.emulator.emulate_key, key_name)  # 异步！
```

**关键时序：**

```
[win32_event_filter 线程]          [线程池 Worker 线程]

KEYUP 到达
→ task.cancel()
→ pool.submit(emulate_key)
  （返回，继续处理下一个事件）
                                    ... 线程池调度延迟 ...
                                    emulate_key 开始执行
                                    _emulating_keys.add('caps_lock')  [A]
                                    press(caps_lock)  [B]
```

**如果线程池调度存在延迟，`press()` 产生的 WM_KEYDOWN 有可能先于 [A] 到达 win32_event_filter：**

```
[win32_event_filter 线程]          [线程池 Worker 线程]

KEYUP 到达
→ task.cancel()
    → is_recording = False
→ pool.submit(emulate_key)
                                    ... 调度延迟 ...
                                    emulate_key 开始执行
补发的 KEYDOWN 到达！←─────────────  press(caps_lock)  [B]  先于 [A] 执行了！
  _check_emulating:
    'caps_lock' not in _emulating_keys  ← 标志还没加入！
    → return False（不是模拟按键）
  handle_keydown 被调用！
    → task.is_recording == False
    → task.launch()！           ← 意外启动新录音！
  
                                    _emulating_keys.add('caps_lock')  [A]  姗姗来迟
```

**这就是振荡的根源：** 补发的 KEYDOWN 在 `_emulating_keys` 标志加入之前被 win32_event_filter 捕获，被误判为用户的新按键，触发了 `task.launch()`。

### 3.5 竞态概率与触发条件

此竞态在以下情况下更容易触发：
- **系统负载高**：线程池任务队列积压，调度延迟增大
- **快速短按**：按下和松开间隔极短，cancel + submit 之间的时间窗口最短
- **首次短按**：线程池冷启动时调度延迟更大

---

## 四、问题分析

### 4.1 竞态时序图

```
正常情况（无竞态）：

KEYDOWN [用户]   KEYUP [用户]   submit   [A] add   [B] press   [B'] KEYDOWN到达   [C] release
    │                │             │          │          │              │                 │
────┼────────────────┼─────────────┼──────────┼──────────┼──────────────┼─────────────────┼───→ 时间
    │                │             │          │          │   检查: ✓在集合│                 │
  launch()         cancel()    线程池提交   标志就位    发送             │               发送
                             （立即返回）  （线程B）   KEYDOWN          │               KEYUP
                                                                      放行，不处理
```

```
竞态情况（标志未就位）：

KEYDOWN [用户]   KEYUP [用户]   submit   [B] press   [B'] KEYDOWN到达   [A] add   [C] release
    │                │             │          │              │                │          │
────┼────────────────┼─────────────┼──────────┼──────────────┼────────────────┼──────────┼───→ 时间
    │                │             │          │   检查: ✗不在集合│              │          │
  launch()         cancel()    线程池提交    发送             │          标志姗姗来迟     发送
                             （立即返回）   KEYDOWN         触发新 launch()！           KEYUP
                                       （线程B）
```

### 4.2 为什么竞态会导致"持续录音"

触发新 `launch()` 之后：
- `task.is_recording = True`，`state.start_recording()` 发送 UDP `recording_start`
- 开始录音，等待用户松键

但用户根本没按键！这次录音没有对应的 KEYUP 事件来触发 `task.finish()`。

**结果：程序陷入等待用户松键的状态，直到用户再次按下 CapsLock（此时触发 KEYUP → finish），才结束这次"幽灵录音"。**

这解释了用户观察到的"高频来回切换"——实际上是：
1. 用户短按 → 正常的 recording_start / recording_stop
2. 竞态触发 → 额外的 recording_start（幽灵录音）
3. 用户再按一次 → recording_stop（结束幽灵录音）→ 然后又 recording_start（正常录音）…

形成了 start/stop 的快速交替。

### 4.3 根本原因归纳

| 原因层级 | 描述 |
|----------|------|
| 直接原因 | `_emulating_keys.add()` 在线程池 Worker 中执行，晚于 `pool.submit()` |
| 根本原因 | 标志设置与按键补发的「原子性」被线程池调度破坏 |
| 设计缺陷 | 将"防自捕获标志"的设置放在了补发逻辑内部，而非补发提交之前 |

---

## 五、修复方案

### 5.1 核心原则

**在 submit 之前（调用线程，即 win32_event_filter 线程）就设置防自捕获标志**，确保从提交到实际补发的整个过程中，标志始终就位。

### 5.2 具体改动

**[`emulator.py`](../CapsWriter-Offline/util/client/shortcut/emulator.py)** — 新增 `mark_emulating()` 方法，并在 `emulate_key()` 中加 `try/finally` 防止异常导致标志泄露：

```python
def mark_emulating(self, key_name: str) -> None:
    """提前标记正在模拟（在 submit 之前调用，消除竞态窗口）"""
    self._emulating_keys.add(key_name)

def emulate_key(self, key_name: str) -> None:
    self._emulating_keys.add(key_name)  # 幂等，防御性重复设置
    key_obj = KeyMapper.name_to_key(key_name)
    if key_obj is not None:
        try:
            self._keyboard_controller.press(key_obj)
            self._keyboard_controller.release(key_obj)
        except Exception as e:
            logger.error(f"[{key_name}] 补发按键失败: {e}")
            self._emulating_keys.discard(key_name)  # 失败时主动清除，防永久屏蔽
    else:
        self._emulating_keys.discard(key_name)
```

**[`event_handler.py`](../CapsWriter-Offline/util/client/shortcut/event_handler.py)** — 在 `submit` 之前先调用 `mark_emulating()`：

```python
def _handle_short_press(self, key_name, task) -> None:
    task.cancel()
    if task.shortcut.suppress:
        # 关键：在 submit 之前（当前线程）设置标志，消除竞态窗口
        self.emulator.mark_emulating(key_name)
        self.pool.submit(self.emulator.emulate_key, key_name)
```

### 5.3 修复后的时序

```
KEYUP [用户]    mark_emulating()   submit   [B] press   [B'] KEYDOWN到达   [A] add(幂等)
     │                │               │          │              │                │
─────┼────────────────┼───────────────┼──────────┼──────────────┼────────────────┼────→ 时间
     │           标志立即就位          │          │   检查: ✓在集合│                │
   cancel()   （win32_event_filter线程）线程池提交  发送          │           重复add无害   
                                              KEYDOWN         放行，不处理
```

无论线程池调度延迟多久，标志在 `submit()` 调用完成时就已在集合中。

---

## 六、归纳总结

### 6.1 经验教训

1. **异步任务中，副作用的顺序至关重要**。将"防护标志"设置在异步任务内部，与将其设置在提交之前，在逻辑上等价（意图相同），但在时序上完全不同。

2. **线程池 `submit()` 不保证立即执行**。特别是在系统负载高、线程池繁忙时，Worker 的实际启动可能有数十毫秒的延迟，而这段延迟完全可能容纳一次 SendInput → 钩子回调的完整往返。

3. **低级 Windows 钩子（`WH_KEYBOARD_LL`）和 `SendInput` 的交互是同步的**。`SendInput` 将事件放入全局输入队列，钩子在消息分发时被调用，这个过程不受 Python GIL 控制，完全在 Windows 内核层面。

4. **Toggle 键（CapsLock/NumLock/ScrollLock）的特殊性**。它们不是普通的按键，而是状态切换键。每次 KEYDOWN 都改变系统状态（LED、`GetKeyState`），所以对这类键的任何意外捕获都会产生可见的副作用。

### 6.2 通用防御模式

**对于"提交异步任务前需要设置防护标志"的场景，正确做法是：**

```python
# ❌ 错误：标志在任务内设置，存在竞态窗口
def submit_and_protect(key):
    pool.submit(lambda: (flag.add(key), do_work(key)))

# ✅ 正确：标志在提交前设置，任务内幂等重复
def submit_and_protect(key):
    flag.add(key)           # 在 submit 前设置，同一线程保证顺序
    pool.submit(do_work, key)  # do_work 内可幂等地再次 add

# do_work 内：
def do_work(key):
    flag.add(key)  # 幂等，防御性重复，无害
    try:
        ...
    except:
        flag.discard(key)  # 异常时主动清除，防泄露
```

### 6.3 修复文件清单

| 文件 | 改动摘要 |
|------|----------|
| [`util/client/shortcut/emulator.py`](../CapsWriter-Offline/util/client/shortcut/emulator.py) | 新增 `mark_emulating()`；`emulate_key()` 加异常保护 + 失败时清除标志 |
| [`util/client/shortcut/event_handler.py`](../CapsWriter-Offline/util/client/shortcut/event_handler.py) | `_handle_short_press()` 在 `submit` 前调用 `mark_emulating()` |
