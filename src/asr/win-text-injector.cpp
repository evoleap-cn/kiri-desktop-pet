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
 */

#include <napi.h>
#include <windows.h>

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
 * Module initialization
 */
Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set("injectText", Napi::Function::New(env, InjectText));
    exports.Set("sendTestChar", Napi::Function::New(env, SendTestChar));
    return exports;
}

NODE_API_MODULE(win_text_injector, Init)
