/**
 * Windows Unicode Text Injector using SendInput API with KEYEVENTF_UNICODE
 *
 * This N-API module directly sends Unicode characters to the active window,
 * bypassing IME (Input Method Editor) interception.
 *
 * Advantages:
 * - Works regardless of current input method state (Chinese/English)
 * - Does NOT occupy clipboard
 * - No popup of IME candidate window
 *
 * Caret Position Tracking:
 * - Layer 1: UI Automation V3 (IUIAutomation3, Windows 8.1+, preferred)
 * - Layer 2: UI Automation V1 (IUIAutomation, Windows 7+ fallback)
 * - Layer 3: GetGUIThreadInfo Win32 API (fallback for traditional apps)
 */

#include <napi.h>
#include <windows.h>
#include <oleacc.h>
#include <UIAutomationClient.h>
#include <stdio.h>
#include <stdarg.h>
#include <string.h>

// Global UI Automation interface pointer
static IUIAutomation* g_pAutomation = NULL;
static BOOL g_bUIAInitialized = FALSE;

// ============================================================
// Aggregated Log Group with Deduplication
// ============================================================

#define MAX_LOG_GROUP 4096

// Current call's log buffer
static char g_logBuf[MAX_LOG_GROUP];
static int g_logPos = 0;

// Last printed log group for deduplication
static char g_lastLogGroup[MAX_LOG_GROUP];

/**
 * Append formatted log to current call's buffer
 */
static void LogAppend(const char* fmt, ...) {
    if (g_logPos >= MAX_LOG_GROUP - 1) return;
    va_list args;
    va_start(args, fmt);
    int written = vsnprintf(g_logBuf + g_logPos, MAX_LOG_GROUP - g_logPos, fmt, args);
    va_end(args);
    if (written > 0) {
        g_logPos += (written < MAX_LOG_GROUP - g_logPos) ? written : (MAX_LOG_GROUP - g_logPos - 1);
    }
}

/**
 * Flush log group: print only if different from last time
 */
static void LogFlush() {
    if (g_logPos == 0) return;
    // Compare with last log group
    if (strcmp(g_logBuf, g_lastLogGroup) == 0) {
        return; // Same as last call, suppress
    }
    // Print and save
    printf("[CaretTracker] %s\n", g_logBuf);
    strncpy(g_lastLogGroup, g_logBuf, MAX_LOG_GROUP);
    g_lastLogGroup[MAX_LOG_GROUP - 1] = '\0';
}

/**
 * Reset log buffer for a new call
 */
static void LogReset() {
    g_logPos = 0;
    g_logBuf[0] = '\0';
}

#ifdef __cplusplus
extern "C" {
#endif

/**
 * Send a single Unicode character using KEYEVENTF_UNICODE
 * 
 * Each character requires two INPUT events:
 * 1. KEYEVENTF_UNICODE (key down)
 * 2. KEYEVENTF_UNICODE | KEYEVENTF_KEYUP (key up)
 */
BOOL SendUnicodeChar(WCHAR ch) {
    INPUT inputs[2] = {0};
    
    // Key down event
    inputs[0].type = INPUT_KEYBOARD;
    inputs[0].ki.wVk = 0;
    inputs[0].ki.wScan = ch;
    inputs[0].ki.dwFlags = KEYEVENTF_UNICODE;
    
    // Key up event
    inputs[1].type = INPUT_KEYBOARD;
    inputs[1].ki.wVk = 0;
    inputs[1].ki.wScan = ch;
    inputs[1].ki.dwFlags = KEYEVENTF_UNICODE | KEYEVENTF_KEYUP;
    
    UINT sent = SendInput(2, inputs, sizeof(INPUT));
    return (sent == 2);
}

#ifdef __cplusplus
}
#endif

/**
 * Get caret position using UI Automation
 * 
 * @param outRect - Output rectangle in screen coordinates
 * @param pAutomation - IUIAutomation interface pointer
 * @return TRUE if successful, FALSE otherwise
 */
BOOL GetCaretPositionUIA(RECT* outRect, IUIAutomation* pAutomation) {
    if (!pAutomation) {
        return FALSE;
    }

    IUIAutomationElement* pFocusedElement = NULL;
    IUIAutomationTextPattern* pTextPattern = NULL;
    IUIAutomationTextRangeArray* pSelectionArray = NULL;
    IUIAutomationTextRange* pRange = NULL;
    SAFEARRAY* pRectsArray = NULL;
    DOUBLE* pRects = NULL;
    LONG lBound = 0;
    LONG uBound = 0;
    LONG numElements = 0;
    int length = 0;
    BSTR elementName = NULL;
    int controlType = 0;
    HRESULT hr;
    BOOL result = FALSE;

    hr = pAutomation->GetFocusedElement(&pFocusedElement);
    if (FAILED(hr) || !pFocusedElement) {
        LogAppend("UIA:GetFocusedElement failed(0x%08X)", hr);
        return FALSE;
    }

    hr = pFocusedElement->GetCurrentPatternAs(
        UIA_TextPatternId, IID_IUIAutomationTextPattern, (void**)&pTextPattern);
    if (FAILED(hr) || !pTextPattern) {
        LogAppend("UIA:GetCurrentPatternAs failed(0x%08X)", hr);
        goto cleanup;
    }

    hr = pTextPattern->GetSelection(&pSelectionArray);
    if (FAILED(hr) || !pSelectionArray) {
        LogAppend("UIA:GetSelection failed(0x%08X)", hr);
        goto cleanup;
    }

    hr = pSelectionArray->get_Length(&length);
    if (FAILED(hr) || length == 0) {
        LogAppend("UIA:GetSelection empty(len=%d,hr=0x%08X)", length, hr);
        goto cleanup;
    }

    hr = pSelectionArray->GetElement(0, &pRange);
    if (FAILED(hr) || !pRange) {
        LogAppend("UIA:GetElement[0] failed(0x%08X)", hr);
        goto cleanup;
    }

    hr = pRange->GetBoundingRectangles(&pRectsArray);
    if (FAILED(hr) || !pRectsArray) {
        LogAppend("UIA:GetBoundingRects failed(0x%08X)", hr);
        goto cleanup;
    }

    hr = SafeArrayGetLBound(pRectsArray, 1, &lBound);
    if (FAILED(hr)) { LogAppend("UIA:SafeArrayLBound failed"); goto cleanup; }
    hr = SafeArrayGetUBound(pRectsArray, 1, &uBound);
    if (FAILED(hr)) { LogAppend("UIA:SafeArrayUBound failed"); goto cleanup; }

    numElements = uBound - lBound + 1;
    if (numElements < 4) {
        LogAppend("UIA:rects too few(got %ld,need 4)", numElements);
        goto cleanup;
    }

    hr = SafeArrayAccessData(pRectsArray, (void**)&pRects);
    if (FAILED(hr) || !pRects) { LogAppend("UIA:SafeArrayAccess failed"); goto cleanup; }

    outRect->left = (LONG)pRects[0];
    outRect->top = (LONG)pRects[1];
    outRect->right = (LONG)(pRects[0] + pRects[2]);
    outRect->bottom = (LONG)(pRects[1] + pRects[3]);

    SafeArrayUnaccessData(pRectsArray);
    LogAppend("UIA OK x=%ld y=%ld w=%ld h=%ld",
              outRect->left, outRect->top,
              outRect->right - outRect->left, outRect->bottom - outRect->top);
    result = TRUE;

cleanup:
    if (elementName) SysFreeString(elementName);
    if (pRectsArray) SafeArrayDestroy(pRectsArray);
    if (pRange) pRange->Release();
    if (pSelectionArray) pSelectionArray->Release();
    if (pTextPattern) pTextPattern->Release();
    if (pFocusedElement) pFocusedElement->Release();
    return result;
}

/**
 * N-API function: injectText(text)
 * 
 * Sends the entire string character by character to the active window.
 * Adds 1ms delay between characters to ensure target application can process.
 */
Napi::Value InjectText(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (info.Length() < 1) {
        Napi::TypeError::New(env, "Expected 1 argument").ThrowAsJavaScriptException();
        return env.Null();
    }
    
    if (!info[0].IsString()) {
        Napi::TypeError::New(env, "Argument must be a string").ThrowAsJavaScriptException();
        return env.Null();
    }
    
    Napi::String jsString = info[0].As<Napi::String>();
    napi_value value = jsString;
    
    // Get UTF-16 string length
    size_t length;
    napi_status status = napi_get_value_string_utf16(env, value, nullptr, 0, &length);
    if (status != napi_ok) {
        Napi::Error::New(env, "Failed to get string length").ThrowAsJavaScriptException();
        return env.Null();
    }
    
    // Allocate buffer and read string
    std::vector<uint16_t> buffer(length + 1);
    status = napi_get_value_string_utf16(env, value, reinterpret_cast<char16_t*>(buffer.data()), length + 1, &length);
    if (status != napi_ok) {
        Napi::Error::New(env, "Failed to read string").ThrowAsJavaScriptException();
        return env.Null();
    }
    
    if (length == 0) {
        return Napi::Boolean::New(env, true);
    }
    
    BOOL success = TRUE;
    
    for (size_t i = 0; i < length; i++) {
        if (!SendUnicodeChar(static_cast<WCHAR>(buffer[i]))) {
            success = FALSE;
            break;
        }
        
        // Small delay between characters (1ms)
        Sleep(1);
    }
    
    return Napi::Boolean::New(env, success == TRUE);
}

/**
 * N-API function: sendTestChar()
 *
 * Test function that sends a single 'A' character.
 * Useful for debugging.
 */
Napi::Value SendTestChar(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    BOOL success = SendUnicodeChar(L'A');
    return Napi::Boolean::New(env, success == TRUE);
}

/**
 * N-API function: getCaretPosition()
 *
 * Retrieves the current screen coordinates of the text caret in the foreground window.
 *
 * Uses a layered approach:
 * 1. UI Automation V3 (IUIAutomation3 - Windows 8.1+, preferred)
 * 2. UI Automation V1 (IUIAutomation - Windows 7+ fallback)
 * 3. GetGUIThreadInfo (fallback for traditional Win32 controls)
 *
 * Returns an object {x, y, width, height} or null if caret position cannot be determined.
 */
Napi::Value GetCaretPosition(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    RECT rcCaret = {0, 0, 0, 0};
    BOOL bSuccess = FALSE;
    BOOL usedUIA = FALSE;

    LogReset();

    // Layer 1: Try UI Automation first
    if (g_pAutomation) {
        bSuccess = GetCaretPositionUIA(&rcCaret, g_pAutomation);
        if (bSuccess) {
            usedUIA = TRUE;
        }
    }

    // Layer 2: Fallback to Win32 GetGUIThreadInfo
    if (!bSuccess) {
        LogAppend("Win32:");
        HWND hwndForeground = GetForegroundWindow();
        if (!hwndForeground) {
            LogAppend(" no foreground window");
        } else {
            DWORD threadId = GetWindowThreadProcessId(hwndForeground, NULL);
            if (!threadId) {
                LogAppend(" no threadId");
            } else {
                GUITHREADINFO guiInfo = {0};
                guiInfo.cbSize = sizeof(GUITHREADINFO);
                if (!GetGUIThreadInfo(threadId, &guiInfo)) {
                    LogAppend(" GetGUIThreadInfo failed");
                } else if (!guiInfo.hwndCaret) {
                    LogAppend(" no hwndCaret");
                } else {
                    POINT pt = {guiInfo.rcCaret.left, guiInfo.rcCaret.top};
                    if (!ClientToScreen(guiInfo.hwndCaret, &pt)) {
                        LogAppend(" ClientToScreen failed");
                    } else {
                        rcCaret.left = pt.x;
                        rcCaret.top = pt.y;
                        rcCaret.right = pt.x + (guiInfo.rcCaret.right - guiInfo.rcCaret.left);
                        rcCaret.bottom = pt.y + (guiInfo.rcCaret.bottom - guiInfo.rcCaret.top);
                        bSuccess = TRUE;
                        LogAppend(" OK x=%ld y=%ld w=%ld h=%ld",
                                  rcCaret.left, rcCaret.top,
                                  rcCaret.right - rcCaret.left,
                                  rcCaret.bottom - rcCaret.top);
                    }
                }
            }
        }
    }

    LogFlush();

    if (bSuccess) {
        Napi::Object result = Napi::Object::New(env);
        result.Set("x", Napi::Number::New(env, rcCaret.left));
        result.Set("y", Napi::Number::New(env, rcCaret.top));
        result.Set("width", Napi::Number::New(env, rcCaret.right - rcCaret.left));
        result.Set("height", Napi::Number::New(env, rcCaret.bottom - rcCaret.top));
        return result;
    }
    return env.Null();
}

/**
 * Module cleanup - called when module is unloaded
 */
void Cleanup(Napi::Env env, void* data) {
    if (g_pAutomation) {
        g_pAutomation->Release();
        g_pAutomation = NULL;
        printf("[CaretTracker] UI Automation released\n");
    }
    CoUninitialize();
    printf("[CaretTracker] COM uninitialized\n");
}

/**
 * Module initialization
 *
 * Initializes COM library and UI Automation interface.
 * Tries V3 first (Windows 8.1+), falls back to V1 (Windows 7+).
 */
Napi::Object Init(Napi::Env env, Napi::Object exports) {
    HRESULT hr;

    // Initialize COM library
    hr = CoInitializeEx(NULL, COINIT_APARTMENTTHREADED);
    if (FAILED(hr) && hr != RPC_E_CHANGED_MODE) {
        printf("[CaretTracker] Failed to initialize COM (hr=0x%08X)\n", hr);
    } else {
        printf("[CaretTracker] COM initialized successfully\n");
    }

    // Register cleanup on module unload
    env.SetInstanceData((void*)1);
    Napi::HandleScope scope(env);
    Napi::Object global = env.Global();
    
    // Try to create UI Automation V3 first (Windows 8.1+)
    hr = CoCreateInstance(
        CLSID_CUIAutomation8,
        NULL,
        CLSCTX_INPROC_SERVER,
        IID_IUIAutomation,
        (void**)&g_pAutomation
    );

    if (SUCCEEDED(hr)) {
        printf("[CaretTracker] UI Automation V3 (CUIAutomation8) initialized\n");
        g_bUIAInitialized = TRUE;
    } else {
        printf("[CaretTracker] UIA V3 not available (hr=0x%08X), trying V1...\n", hr);

        // Fallback to UI Automation V1 (Windows 7+)
        hr = CoCreateInstance(
            CLSID_CUIAutomation,
            NULL,
            CLSCTX_INPROC_SERVER,
            IID_IUIAutomation,
            (void**)&g_pAutomation
        );

        if (SUCCEEDED(hr)) {
            printf("[CaretTracker] UI Automation V1 (CUIAutomation) initialized\n");
            g_bUIAInitialized = TRUE;
        } else {
            printf("[CaretTracker] UIA V1 also failed (hr=0x%08X), UIA disabled\n", hr);
            g_pAutomation = NULL;
            g_bUIAInitialized = FALSE;
        }
    }

    // Export functions
    exports.Set("injectText", Napi::Function::New(env, InjectText));
    exports.Set("sendTestChar", Napi::Function::New(env, SendTestChar));
    exports.Set("getCaretPosition", Napi::Function::New(env, GetCaretPosition));
    return exports;
}

NODE_API_MODULE(win_text_injector, Init)
