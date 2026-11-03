#include <cstring>
#include <mutex>
#include "napi/native_api.h"
extern "C" {
#include "flite.h"
cst_voice *register_cmu_us_slt(const char *);
}

// Called from an ArkTS taskpool worker. Flite caches its lexicon and voice.
static napi_value Pcm(napi_env env, napi_callback_info info) {
    napi_value arg;
    size_t argc = 1, size = 0;
    char text[1025] = {};
    if (napi_get_cb_info(env, info, &argc, &arg, nullptr, nullptr) != napi_ok ||
        argc != 1 || napi_get_value_string_utf8(env, arg, nullptr, 0, &size) != napi_ok ||
        size == 0 || size >= sizeof(text) ||
        napi_get_value_string_utf8(env, arg, text, sizeof(text), &size) != napi_ok ||
        std::strlen(text) != size) {
        napi_throw_error(env, nullptr, "Invalid speech segment");
        return nullptr;
    }
    static std::mutex mutex;
    std::lock_guard<std::mutex> lock(mutex);
    static cst_voice *voice = [] { flite_init(); return register_cmu_us_slt(nullptr); }();
    cst_wave *wave = voice ? flite_text_to_wave(text, voice) : nullptr;
    napi_value result = nullptr;
    void *bytes = nullptr;
    if (wave && wave->sample_rate == 16000 && wave->num_channels == 1 &&
        wave->num_samples > 0 && wave->num_samples <= 4 * 1024 * 1024 &&
        napi_create_arraybuffer(env, wave->num_samples * 2, &bytes, &result) == napi_ok)
        std::memcpy(bytes, wave->samples, wave->num_samples * 2);
    if (wave) delete_wave(wave);
    if (!result) napi_throw_error(env, nullptr, "Speech synthesis failed");
    return result;
}
static napi_value Init(napi_env env, napi_value exports) {
    napi_property_descriptor method = {"pcm", nullptr, Pcm, nullptr, nullptr, nullptr, napi_default, nullptr};
    napi_define_properties(env, exports, 1, &method);
    return exports;
}
static napi_module module = {1, 0, nullptr, Init, "englishvoice", nullptr, {0}};
extern "C" __attribute__((constructor)) void RegisterVoice() { napi_module_register(&module); }
