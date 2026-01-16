# {
#   "targets": [
#     {
#       "target_name": "curlnapi",
#       "sources": ["addon.cc"],
#       "include_dirs": [
#         "<(module_root_dir)/ffi",
#         "<(module_root_dir)/lib64/include",
#         "<!@(node -p \"require('node-addon-api').include\")"
#       ],
#       "defines": ["NAPI_VERSION=8", "NAPI_CPP_EXCEPTIONS"],
#       "cflags!": ["-fno-exceptions"],
#       "cflags_cc!": ["-fno-exceptions"],
#       "conditions": [
#         ["OS=='win'", {
#           "libraries": [
#             "-lCrypt32",
#             "-lSecur32",
#             "-lwldap32",
#             "-lNormaliz",
#             "-liphlpapi",
#             "<(module_root_dir)/lib64/libcurl_imp.lib",
#             "<(module_root_dir)/lib64/zstd.lib",
#             "<(module_root_dir)/lib64/zlib.lib",
#             "<(module_root_dir)/lib64/ssl.lib",
#             "<(module_root_dir)/lib64/nghttp2.lib",
#             "<(module_root_dir)/lib64/nghttp3.lib",
#             "<(module_root_dir)/lib64/ngtcp2.lib",
#             "<(module_root_dir)/lib64/ngtcp2_crypto_boringssl.lib",
#             "<(module_root_dir)/lib64/crypto.lib",
#             "<(module_root_dir)/lib64/brotlienc.lib",
#             "<(module_root_dir)/lib64/brotlidec.lib",
#             "<(module_root_dir)/lib64/brotlicommon.lib",
#             "<(module_root_dir)/lib64/cares.lib"
#           ],
#           "msvs_settings": {
#             "VCCLCompilerTool": {
#               "AdditionalOptions": ["/EHsc"]
#             }
#           }
#         }],
#         ["OS=='mac'", {
#           "libraries": ["-lcurl-impersonate"]
#         }],
#         ["OS=='linux'", {
#           "libraries": [
#             "<(module_root_dir)/lib64/libcurl-impersonate.a",
#             "<(module_root_dir)/lib64/libssl.a",
#             "<(module_root_dir)/lib64/libcrypto.a",
#             "<(module_root_dir)/lib64/libz.a",
#             "<(module_root_dir)/lib64/libzstd.a",
#             "<(module_root_dir)/lib64/libnghttp2.a",
#             "<(module_root_dir)/lib64/libngtcp2.a",
#             "<(module_root_dir)/lib64/libngtcp2_crypto_boringssl.a",
#             "<(module_root_dir)/lib64/libnghttp3.a",
#             "<(module_root_dir)/lib64/libbrotlidec.a",
#             "<(module_root_dir)/lib64/libbrotlienc.a",
#             "<(module_root_dir)/lib64/libbrotlicommon.a",
#             "<(module_root_dir)/lib64/libcares.a"
#           ]
#         }]
#       ]
#     }
#   ]
# }
{
  "targets": [
    {
      "target_name": "curlnapi",
      "sources": ["addon.cc"],
      "include_dirs": [
        "<(module_root_dir)/ffi",
        "<(module_root_dir)/lib64/include",
        "<!@(node -p \"require('node-addon-api').include\")"
      ],
      "defines": ["NAPI_VERSION=8", "NAPI_CPP_EXCEPTIONS"],
      "cflags!": ["-fno-exceptions"],
      "cflags_cc!": ["-fno-exceptions"],
      "conditions": [
        ["OS=='win'", {
          "libraries": [
            "-lCrypt32",
            "-lSecur32",
            "-lwldap32",
            "-lNormaliz",
            "-liphlpapi",
            "<(module_root_dir)/lib64/libcurl_imp.lib",
            "<(module_root_dir)/lib64/zstd.lib",
            "<(module_root_dir)/lib64/zlib.lib",
            "<(module_root_dir)/lib64/ssl.lib",
            "<(module_root_dir)/lib64/nghttp2.lib",
            "<(module_root_dir)/lib64/nghttp3.lib",
            "<(module_root_dir)/lib64/ngtcp2.lib",
            "<(module_root_dir)/lib64/ngtcp2_crypto_boringssl.lib",
            "<(module_root_dir)/lib64/crypto.lib",
            "<(module_root_dir)/lib64/brotlienc.lib",
            "<(module_root_dir)/lib64/brotlidec.lib",
            "<(module_root_dir)/lib64/brotlicommon.lib",
            "<(module_root_dir)/lib64/cares.lib"
          ],
          "msvs_settings": {
            "VCCLCompilerTool": {
              "AdditionalOptions": ["/EHsc"]
            }
          }
        }],
        ["OS=='mac'", {
          "libraries": ["-lcurl-impersonate"]
        }],
        ["OS=='linux'", {
          "libraries": [
            "<(module_root_dir)/lib64/libcurl-impersonate.a",
            "<(module_root_dir)/lib64/libssl.a",
            "<(module_root_dir)/lib64/libcrypto.a",
            "<(module_root_dir)/lib64/libz.a",
            "<(module_root_dir)/lib64/libzstd.a",
            "<(module_root_dir)/lib64/libnghttp2.a",
            "<(module_root_dir)/lib64/libngtcp2.a",
            "<(module_root_dir)/lib64/libngtcp2_crypto_boringssl.a",
            "<(module_root_dir)/lib64/libnghttp3.a",
            "<(module_root_dir)/lib64/libbrotlidec.a",
            "<(module_root_dir)/lib64/libbrotlienc.a",
            "<(module_root_dir)/lib64/libbrotlicommon.a",
            "<(module_root_dir)/lib64/libcares.a",
            "-ldl",
            "-lpthread",
            "-lresolv",
            "-lm"
          ]
        }]
      ]
    }
  ]
}
