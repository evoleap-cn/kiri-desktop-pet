{
  "targets": [
    {
      "target_name": "win_text_injector",
      "sources": [
        "src/asr/win-text-injector.cpp"
      ],
      "conditions": [
        ["OS=='win'", {
          "libraries": [
            "-luser32"
          ],
          "defines": [
            "UNICODE",
            "_UNICODE",
            "WIN32_LEAN_AND_MEAN"
          ],
          "msvs_settings": {
            "VCCLCompilerTool": {
              "ExceptionHandling": 1
            }
          }
        }]
      ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")"
      ],
      "cflags!": [
        "-fno-exceptions"
      ],
      "cflags_cc!": [
        "-fno-exceptions"
      ]
    }
  ]
}
