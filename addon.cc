#include <napi.h>
#include <string>
#include <vector>
#include <algorithm>
#include "curl/curl.h"

static size_t write_cb(char* ptr, size_t size, size_t nmemb, void* userdata) {
  std::string* s = reinterpret_cast<std::string*>(userdata);
  s->append(ptr, size * nmemb);
  return size * nmemb;
}

struct HeaderCollector {
  std::vector<std::pair<std::string, std::string>> headers;
};

static size_t header_cb(char* buffer, size_t size, size_t nitems, void* userdata) {
  size_t len = size * nitems;
  std::string line(buffer, len);
  // Skip status line
  if (line.rfind("HTTP/", 0) == 0) return len;
  auto pos = line.find(':');
  if (pos != std::string::npos) {
    std::string key = line.substr(0, pos);
    std::string val = line.substr(pos + 1);
    // trim leading spaces and trailing CRLF
    val.erase(val.begin(), std::find_if(val.begin(), val.end(), [](unsigned char ch){ return !std::isspace(ch); }));
    while (!val.empty() && (val.back()=='\r' || val.back()=='\n')) val.pop_back();
    ((HeaderCollector*)userdata)->headers.emplace_back(key, val);
  }
  return len;
}

static std::string normalizeBrowser(const std::string& b) {
  if (b == "Chrome" || b == "chrome") return "chrome142";
  if (b == "Firefox" || b == "firefox") return "firefox144";
  return b;
}

static std::string ensureProxyScheme(const std::string& u) {
  if (u.rfind("http://", 0) == 0 || u.rfind("https://", 0) == 0 || u.rfind("socks5://", 0) == 0 || u.rfind("socks5h://", 0) == 0 || u.rfind("socks4://", 0) == 0 || u.rfind("socks4a://", 0) == 0) {
    return u;
  }
  return std::string("http://") + u;
}

class ImpitWrapper : public Napi::ObjectWrap<ImpitWrapper> {
public:
  static Napi::Function InitClass(Napi::Env env) {
    return DefineClass(env, "Impit", {
      InstanceMethod<&ImpitWrapper::Fetch>("fetch"),
      InstanceMethod<&ImpitWrapper::GetCookies>("getCookies"),
      InstanceMethod<&ImpitWrapper::SetCookies>("setCookies")
    });
  }

  ImpitWrapper(const Napi::CallbackInfo& info) : Napi::ObjectWrap<ImpitWrapper>(info) {
    Napi::Env env = info.Env();
    if (info.Length() >= 1 && info[0].IsObject()) {
      Napi::Object o = info[0].As<Napi::Object>();
      if (o.Has("verbose") && o.Get("verbose").IsBoolean()) verbose = o.Get("verbose").As<Napi::Boolean>().Value();
      if (o.Has("browser") && o.Get("browser").IsString()) browser = normalizeBrowser(o.Get("browser").As<Napi::String>().Utf8Value());
      if (o.Has("impersonate") && o.Get("impersonate").IsString()) browser = normalizeBrowser(o.Get("impersonate").As<Napi::String>().Utf8Value());
      if (o.Has("timeout") && o.Get("timeout").IsNumber()) timeoutMs = o.Get("timeout").As<Napi::Number>().Uint32Value();
      if (o.Has("ignoreTlsErrors") && o.Get("ignoreTlsErrors").IsBoolean()) verify = !o.Get("ignoreTlsErrors").As<Napi::Boolean>().Value();
      if (o.Has("caPath") && o.Get("caPath").IsString()) caPath = o.Get("caPath").As<Napi::String>().Utf8Value();
      if (o.Has("followRedirects") && o.Get("followRedirects").IsBoolean()) followRedirects = o.Get("followRedirects").As<Napi::Boolean>().Value();
      if (o.Has("proxy") && o.Get("proxy").IsString()) proxyUrl = o.Get("proxy").As<Napi::String>().Utf8Value();
      if (o.Has("proxy_username") && o.Get("proxy_username").IsString()) proxyUsername = o.Get("proxy_username").As<Napi::String>().Utf8Value();
      if (o.Has("proxy_password") && o.Get("proxy_password").IsString()) proxyPassword = o.Get("proxy_password").As<Napi::String>().Utf8Value();
      if (o.Has("ignoreProxyTlsErrors") && o.Get("ignoreProxyTlsErrors").IsBoolean()) ignoreProxyTlsErrors = o.Get("ignoreProxyTlsErrors").As<Napi::Boolean>().Value();
      if (o.Has("connectTimeout")) connectTimeoutMs = o.Get("connectTimeout").As<Napi::Number>().Uint32Value();
      if (o.Has("maxRedirects")) maxRedirects = o.Get("maxRedirects").As<Napi::Number>().Uint32Value();
      if (o.Has("httpVersion")) {
        if (o.Get("httpVersion").IsNumber()) httpVersion = o.Get("httpVersion").As<Napi::Number>().Int32Value();
        else if (o.Get("httpVersion").IsString()) {
          std::string hv = o.Get("httpVersion").As<Napi::String>().Utf8Value();
          if (hv == "2" || hv == "h2") httpVersion = 2;
          else if (hv == "3" || hv == "h3") httpVersion = 3;
        }
      }
      if (o.Has("ipResolve")) ipResolve = o.Get("ipResolve").As<Napi::String>().Utf8Value();
      if (o.Has("dohUrl")) dohUrl = o.Get("dohUrl").As<Napi::String>().Utf8Value();
      if (o.Has("ignoreDohTlsErrors")) ignoreDohTlsErrors = o.Get("ignoreDohTlsErrors").As<Napi::Boolean>().Value();
      if (o.Has("userAgent")) userAgent = o.Get("userAgent").As<Napi::String>().Utf8Value();
      if (o.Has("referer")) referer = o.Get("referer").As<Napi::String>().Utf8Value();
      if (o.Has("cookieJarPath")) cookieJarPath = o.Get("cookieJarPath").As<Napi::String>().Utf8Value();
      if (o.Has("proxy_type")) proxyType = o.Get("proxy_type").As<Napi::String>().Utf8Value();
      if (o.Has("proxy_auth")) proxyAuth = o.Get("proxy_auth").As<Napi::String>().Utf8Value();
      if (o.Has("noProxy")) {
        if (o.Get("noProxy").IsString()) {
          noProxy = o.Get("noProxy").As<Napi::String>().Utf8Value();
        } else if (o.Get("noProxy").IsArray()) {
          Napi::Array arr = o.Get("noProxy").As<Napi::Array>();
          std::string joined;
          for (uint32_t i=0;i<arr.Length();++i) {
            if (arr.Get(i).IsString()) {
              if (!joined.empty()) joined.push_back(',');
              joined += arr.Get(i).As<Napi::String>().Utf8Value();
            }
          }
          noProxy = joined;
        }
      }
      if (o.Has("headers") && o.Get("headers").IsObject()) {
        Napi::Object h = o.Get("headers").As<Napi::Object>();
        auto props = h.GetPropertyNames();
        for (uint32_t i=0;i<props.Length();++i) {
          std::string k = props.Get(i).As<Napi::String>().Utf8Value();
          std::string v = h.Get(k).As<Napi::String>().Utf8Value();
          defaultHeaders.emplace_back(k, v);
        }
      }
    }
  }

  Napi::Value Fetch(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    auto deferred = Napi::Promise::Deferred::New(env);
    if (info.Length() < 1) {
      deferred.Reject(Napi::Error::New(env, "url required").Value());
      return deferred.Promise();
    }
    std::string url = info[0].As<Napi::String>().Utf8Value();
    std::string method = "GET";
    std::vector<std::pair<std::string,std::string>> headers = defaultHeaders;
    std::string bodyStr;
    bool hasBody = false;
    uint32_t reqTimeout = timeoutMs;
    bool forceHttp3 = false; // ignored

    if (info.Length() >= 2 && info[1].IsObject()) {
      Napi::Object init = info[1].As<Napi::Object>();
      if (init.Has("method")) method = init.Get("method").As<Napi::String>().Utf8Value();
      if (init.Has("headers") && init.Get("headers").IsObject()) {
        Napi::Object h = init.Get("headers").As<Napi::Object>();
        auto props = h.GetPropertyNames();
        for (uint32_t i=0;i<props.Length();++i) {
          std::string k = props.Get(i).As<Napi::String>().Utf8Value();
          std::string v = h.Get(k).IsString() ? h.Get(k).As<Napi::String>().Utf8Value() : h.Get(k).ToString().Utf8Value();
          headers.emplace_back(k, v);
        }
      }
      if (init.Has("body")) {
        if (init.Get("body").IsBuffer()) {
          Napi::Buffer<uint8_t> buf = init.Get("body").As<Napi::Buffer<uint8_t>>();
          bodyStr.assign(reinterpret_cast<const char*>(buf.Data()), buf.Length());
          hasBody = true;
        } else if (init.Get("body").IsString()) {
          bodyStr = init.Get("body").As<Napi::String>().Utf8Value();
          hasBody = true;
        }
      }
      if (init.Has("timeout")) reqTimeout = init.Get("timeout").As<Napi::Number>().Uint32Value();
      if (init.Has("force_http3")) forceHttp3 = init.Get("force_http3").As<Napi::Boolean>().Value();
    }

    std::string upperMethod = method;
    std::transform(upperMethod.begin(), upperMethod.end(), upperMethod.begin(), ::toupper);
    if ((upperMethod == "GET" || upperMethod == "HEAD") && hasBody) {
      deferred.Reject(Napi::Error::New(env, "GET/HEAD methods don't support passing a request body").Value());
      return deferred.Promise();
    }

    CURL* curl = curl_easy_init();
    if (!curl) {
      deferred.Reject(Napi::Error::New(env, "curl_easy_init failed").Value());
      return deferred.Promise();
    }
    
    // Cookie Engine & Jar
    curl_easy_setopt(curl, CURLOPT_COOKIEFILE, ""); 
    for(const auto& c : cookieJar) {
      curl_easy_setopt(curl, CURLOPT_COOKIELIST, c.c_str());
    }

    if (!browser.empty()) {
      curl_easy_impersonate(curl, browser.c_str(), 1);
    }
    curl_easy_setopt(curl, CURLOPT_URL, url.c_str());
    curl_easy_setopt(curl, CURLOPT_ACCEPT_ENCODING, "");
    curl_easy_setopt(curl, CURLOPT_TIMEOUT_MS, reqTimeout);
    curl_easy_setopt(curl, CURLOPT_FOLLOWLOCATION, followRedirects ? 1L : 0L);
    if (!verify) {
      curl_easy_setopt(curl, CURLOPT_SSL_VERIFYPEER, 0L);
      curl_easy_setopt(curl, CURLOPT_SSL_VERIFYHOST, 0L);
    }
    if (!caPath.empty()) {
      curl_easy_setopt(curl, CURLOPT_CAINFO, caPath.c_str());
      curl_easy_setopt(curl, CURLOPT_PROXY_CAINFO, caPath.c_str());
    }
    uint32_t effConnectTimeout = connectTimeoutMs;
    uint32_t effMaxRedirects = maxRedirects;
    int effHttpVersion = httpVersion;
    std::string effIpResolve = ipResolve;
    std::string effDohUrl = dohUrl;
    bool effIgnoreDohTls = ignoreDohTlsErrors;
    std::string effUserAgent = userAgent;

    // Apply other options...
    if (effConnectTimeout > 0) curl_easy_setopt(curl, CURLOPT_CONNECTTIMEOUT_MS, effConnectTimeout);
    if (effMaxRedirects > 0) curl_easy_setopt(curl, CURLOPT_MAXREDIRS, effMaxRedirects);
    if (effHttpVersion != 0) {
      if (effHttpVersion == 2) curl_easy_setopt(curl, CURLOPT_HTTP_VERSION, CURL_HTTP_VERSION_2_0);
      else if (effHttpVersion == 3) curl_easy_setopt(curl, CURLOPT_HTTP_VERSION, CURL_HTTP_VERSION_3);
    }
    if (!effIpResolve.empty()) {
      if (effIpResolve == "v4") curl_easy_setopt(curl, CURLOPT_IPRESOLVE, CURL_IPRESOLVE_V4);
      else if (effIpResolve == "v6") curl_easy_setopt(curl, CURLOPT_IPRESOLVE, CURL_IPRESOLVE_V6);
    }
    // IMPORTANT: When using c-ares (which curl-impersonate uses statically), 
    // it might not read /etc/resolv.conf correctly in some environments or if permissions issue.
    // Explicitly setting DNS servers helps.
    if (!effDohUrl.empty()) {
      curl_easy_setopt(curl, CURLOPT_DOH_URL, effDohUrl.c_str());
      if (effIgnoreDohTls) {
        curl_easy_setopt(curl, CURLOPT_DOH_SSL_VERIFYPEER, 0L);
        curl_easy_setopt(curl, CURLOPT_DOH_SSL_VERIFYHOST, 0L);
      }
    }
    struct curl_slist* dohResolve = NULL;
    if (!effDohUrl.empty()) {
      std::string host;
      size_t p = effDohUrl.find("://");
      size_t s = (p == std::string::npos) ? 0 : p + 3;
      size_t e = effDohUrl.find('/', s);
      host = effDohUrl.substr(s, e == std::string::npos ? std::string::npos : e - s);
      size_t c = host.find(':');
      if (c != std::string::npos) host = host.substr(0, c);
      if (host == "cloudflare-dns.com") {
        dohResolve = curl_slist_append(dohResolve, "cloudflare-dns.com:443:1.1.1.1");
        dohResolve = curl_slist_append(dohResolve, "cloudflare-dns.com:443:1.0.0.1");
      } else if (host == "dns.google") {
        dohResolve = curl_slist_append(dohResolve, "dns.google:443:8.8.8.8");
        dohResolve = curl_slist_append(dohResolve, "dns.google:443:8.8.4.4");
      }
      if (dohResolve) {
        curl_easy_setopt(curl, CURLOPT_RESOLVE, dohResolve);
      }
    }
    if (!effUserAgent.empty()) curl_easy_setopt(curl, CURLOPT_USERAGENT, effUserAgent.c_str());
    std::string effReferer = referer;
    std::string effCookieJar = cookieJarPath;
    std::string effProxyType = proxyType;
    std::string effProxyAuth = proxyAuth;
    std::string effProxy = proxyUrl;
    std::string effProxyUser = proxyUsername;
    std::string effProxyPass = proxyPassword;
    std::string effNoProxy = noProxy;
    bool effIgnoreProxyTls = ignoreProxyTlsErrors;
    if (info.Length() >= 2 && info[1].IsObject()) {
      Napi::Object init = info[1].As<Napi::Object>();
      if (init.Has("proxy") && init.Get("proxy").IsString()) effProxy = init.Get("proxy").As<Napi::String>().Utf8Value();
      if (init.Has("proxy_username") && init.Get("proxy_username").IsString()) effProxyUser = init.Get("proxy_username").As<Napi::String>().Utf8Value();
      if (init.Has("proxy_password") && init.Get("proxy_password").IsString()) effProxyPass = init.Get("proxy_password").As<Napi::String>().Utf8Value();
      if (init.Has("ignoreProxyTlsErrors") && init.Get("ignoreProxyTlsErrors").IsBoolean()) effIgnoreProxyTls = init.Get("ignoreProxyTlsErrors").As<Napi::Boolean>().Value();
      if (init.Has("connectTimeout")) effConnectTimeout = init.Get("connectTimeout").As<Napi::Number>().Uint32Value();
      if (init.Has("maxRedirects")) effMaxRedirects = init.Get("maxRedirects").As<Napi::Number>().Uint32Value();
      if (init.Has("httpVersion")) {
        if (init.Get("httpVersion").IsNumber()) effHttpVersion = init.Get("httpVersion").As<Napi::Number>().Int32Value();
        else if (init.Get("httpVersion").IsString()) {
          std::string hv = init.Get("httpVersion").As<Napi::String>().Utf8Value();
          if (hv == "2" || hv == "h2") effHttpVersion = 2;
          else if (hv == "3" || hv == "h3") effHttpVersion = 3;
        }
      }
      if (init.Has("ipResolve")) effIpResolve = init.Get("ipResolve").As<Napi::String>().Utf8Value();
      if (init.Has("dohUrl")) effDohUrl = init.Get("dohUrl").As<Napi::String>().Utf8Value();
      if (init.Has("ignoreDohTlsErrors")) effIgnoreDohTls = init.Get("ignoreDohTlsErrors").As<Napi::Boolean>().Value();
      if (init.Has("userAgent")) effUserAgent = init.Get("userAgent").As<Napi::String>().Utf8Value();
      if (init.Has("referer")) effReferer = init.Get("referer").As<Napi::String>().Utf8Value();
      if (init.Has("cookieJarPath")) effCookieJar = init.Get("cookieJarPath").As<Napi::String>().Utf8Value();
      if (init.Has("proxy_type")) effProxyType = init.Get("proxy_type").As<Napi::String>().Utf8Value();
      if (init.Has("proxy_auth")) effProxyAuth = init.Get("proxy_auth").As<Napi::String>().Utf8Value();
      if (init.Has("noProxy")) {
        if (init.Get("noProxy").IsString()) {
          effNoProxy = init.Get("noProxy").As<Napi::String>().Utf8Value();
        } else if (init.Get("noProxy").IsArray()) {
          Napi::Array arr = init.Get("noProxy").As<Napi::Array>();
          std::string joined;
          for (uint32_t i=0;i<arr.Length();++i) {
            if (arr.Get(i).IsString()) {
              if (!joined.empty()) joined.push_back(',');
              joined += arr.Get(i).As<Napi::String>().Utf8Value();
            }
          }
          effNoProxy = joined;
        }
      }
    }
    if (!effProxy.empty()) {
      std::string p = ensureProxyScheme(effProxy);
      curl_easy_setopt(curl, CURLOPT_PROXY, p.c_str());
    }
    if (!effProxyType.empty()) {
      long pt = CURLPROXY_HTTP;
      if (effProxyType == "http") pt = CURLPROXY_HTTP;
      else if (effProxyType == "socks5") pt = CURLPROXY_SOCKS5;
      else if (effProxyType == "socks5h") pt = CURLPROXY_SOCKS5_HOSTNAME;
      else if (effProxyType == "socks4") pt = CURLPROXY_SOCKS4;
      else if (effProxyType == "socks4a") pt = CURLPROXY_SOCKS4A;
      curl_easy_setopt(curl, CURLOPT_PROXYTYPE, pt);
    }
    if (!effProxyAuth.empty()) {
      long pa = CURLAUTH_ANY;
      if (effProxyAuth == "basic") pa = CURLAUTH_BASIC;
      else if (effProxyAuth == "digest") pa = CURLAUTH_DIGEST;
      else if (effProxyAuth == "ntlm") pa = CURLAUTH_NTLM;
      else if (effProxyAuth == "any") pa = CURLAUTH_ANY;
      curl_easy_setopt(curl, CURLOPT_PROXYAUTH, pa);
    }
    if (!effProxyUser.empty()) {
      curl_easy_setopt(curl, CURLOPT_PROXYUSERNAME, effProxyUser.c_str());
    }
    if (!effProxyPass.empty()) {
      curl_easy_setopt(curl, CURLOPT_PROXYPASSWORD, effProxyPass.c_str());
    }
    if (!effNoProxy.empty()) {
      curl_easy_setopt(curl, CURLOPT_NOPROXY, effNoProxy.c_str());
    }
    if (effIgnoreProxyTls) {
      curl_easy_setopt(curl, CURLOPT_PROXY_SSL_VERIFYPEER, 0L);
      curl_easy_setopt(curl, CURLOPT_PROXY_SSL_VERIFYHOST, 0L);
    }
    if (effConnectTimeout > 0) {
      curl_easy_setopt(curl, CURLOPT_CONNECTTIMEOUT_MS, (long)effConnectTimeout);
    }
    if (effMaxRedirects > 0) {
      curl_easy_setopt(curl, CURLOPT_MAXREDIRS, (long)effMaxRedirects);
    }
    if (forceHttp3 || effHttpVersion == 3) {
      curl_easy_setopt(curl, CURLOPT_HTTP_VERSION, (long)CURL_HTTP_VERSION_3);
    } else if (effHttpVersion == 2) {
      curl_easy_setopt(curl, CURLOPT_HTTP_VERSION, (long)CURL_HTTP_VERSION_2_0);
    }
    if (!effIpResolve.empty()) {
      long ir = CURL_IPRESOLVE_WHATEVER;
      if (effIpResolve == "v4") ir = CURL_IPRESOLVE_V4;
      else if (effIpResolve == "v6") ir = CURL_IPRESOLVE_V6;
      curl_easy_setopt(curl, CURLOPT_IPRESOLVE, ir);
    }

    if (verbose) {
      curl_easy_setopt(curl, CURLOPT_VERBOSE, 1L);
    }
    if (!effDohUrl.empty()) {
      curl_easy_setopt(curl, CURLOPT_DOH_URL, effDohUrl.c_str());
      if (effIgnoreDohTls) {
        curl_easy_setopt(curl, CURLOPT_DOH_SSL_VERIFYPEER, 0L);
        curl_easy_setopt(curl, CURLOPT_DOH_SSL_VERIFYHOST, 0L);
      }
    }
    if (!effUserAgent.empty()) {
      curl_easy_setopt(curl, CURLOPT_USERAGENT, effUserAgent.c_str());
    }
    if (!effReferer.empty()) {
      curl_easy_setopt(curl, CURLOPT_REFERER, effReferer.c_str());
    }
    if (!effCookieJar.empty()) {
      curl_easy_setopt(curl, CURLOPT_COOKIEJAR, effCookieJar.c_str());
    }
    // Headers
    struct curl_slist* chunk = NULL;
    for (auto& kv : headers) {
      std::string line = kv.first + ": " + kv.second;
      chunk = curl_slist_append(chunk, line.c_str());
    }
    if (chunk) curl_easy_setopt(curl, CURLOPT_HTTPHEADER, chunk);
    // Method & body
    if (upperMethod == "GET") {
      curl_easy_setopt(curl, CURLOPT_HTTPGET, 1L);
    } else if (upperMethod == "HEAD") {
      curl_easy_setopt(curl, CURLOPT_NOBODY, 1L);
    } else if (upperMethod == "POST") {
      curl_easy_setopt(curl, CURLOPT_POST, 1L);
      if (hasBody) {
        curl_easy_setopt(curl, CURLOPT_POSTFIELDS, bodyStr.c_str());
        curl_easy_setopt(curl, CURLOPT_POSTFIELDSIZE, (long)bodyStr.size());
      }
    } else {
      curl_easy_setopt(curl, CURLOPT_CUSTOMREQUEST, upperMethod.c_str());
      if (hasBody) {
        curl_easy_setopt(curl, CURLOPT_POSTFIELDS, bodyStr.c_str());
        curl_easy_setopt(curl, CURLOPT_POSTFIELDSIZE, (long)bodyStr.size());
      }
    }
    // Collect body and headers
    std::string respBody;
    HeaderCollector hc;
    curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, write_cb);
    curl_easy_setopt(curl, CURLOPT_WRITEDATA, &respBody);
    curl_easy_setopt(curl, CURLOPT_HEADERFUNCTION, header_cb);
    curl_easy_setopt(curl, CURLOPT_HEADERDATA, &hc);

    CURLcode rc = curl_easy_perform(curl);
    long status = 0;
    char* effUrl = nullptr;
    if (rc == CURLE_OK) {
      curl_easy_getinfo(curl, CURLINFO_RESPONSE_CODE, &status);
      curl_easy_getinfo(curl, CURLINFO_EFFECTIVE_URL, &effUrl);

      // Sync cookies back to jar
      struct curl_slist *cookies = NULL;
      curl_easy_getinfo(curl, CURLINFO_COOKIELIST, &cookies);
      if (cookies) {
        cookieJar.clear();
        struct curl_slist *nc = cookies;
        while (nc) {
          cookieJar.push_back(nc->data);
          nc = nc->next;
        }
        curl_slist_free_all(cookies);
      }
    }
    if (chunk) curl_slist_free_all(chunk);
    if (dohResolve) curl_slist_free_all(dohResolve);
    curl_easy_cleanup(curl);

    if (rc != CURLE_OK) {
      deferred.Reject(Napi::Error::New(env, curl_easy_strerror(rc)).Value());
      return deferred.Promise();
    }

    Napi::Object resp = Napi::Object::New(env);
    resp.Set("status", Napi::Number::New(env, status));
    resp.Set("status_text", Napi::String::New(env, "")); // Simplified
    resp.Set("ok", Napi::Boolean::New(env, status >= 200 && status < 300));
    resp.Set("url", Napi::String::New(env, effUrl ? std::string(effUrl) : url));
    // headers: array of [key,value]
    Napi::Array hArr = Napi::Array::New(env, hc.headers.size());
    for (size_t i=0;i<hc.headers.size();++i) {
      Napi::Array pair = Napi::Array::New(env, 2);
      pair.Set((uint32_t)0, Napi::String::New(env, hc.headers[i].first));
      pair.Set((uint32_t)1, Napi::String::New(env, hc.headers[i].second));
      hArr.Set((uint32_t)i, pair);
    }
    resp.Set("headers", hArr);
    // store body
    resp.Set("_body", Napi::String::New(env, respBody));
    // methods
    resp.Set("text", Napi::Function::New(env, [](const Napi::CallbackInfo& info){
      Napi::Env env = info.Env();
      Napi::Object self = info.This().As<Napi::Object>();
      std::string body = self.Get("_body").As<Napi::String>().Utf8Value();
      auto d = Napi::Promise::Deferred::New(env);
      d.Resolve(Napi::String::New(env, body));
      return d.Promise();
    }));
    resp.Set("json", Napi::Function::New(env, [](const Napi::CallbackInfo& info){
      Napi::Env env = info.Env();
      Napi::Object self = info.This().As<Napi::Object>();
      std::string body = self.Get("_body").As<Napi::String>().Utf8Value();
      auto d = Napi::Promise::Deferred::New(env);
      try {
        Napi::Value parsed = Napi::Env(env).Global().Get("JSON").As<Napi::Object>().Get("parse").As<Napi::Function>().Call({ Napi::String::New(env, body) });
        d.Resolve(parsed);
      } catch(const Napi::Error& e) {
        d.Reject(e.Value());
      } catch(...) {
        d.Reject(Napi::Error::New(env, "Invalid JSON").Value());
      }
      return d.Promise();
    }));
    resp.Set("bytes", Napi::Function::New(env, [](const Napi::CallbackInfo& info){
      Napi::Env env = info.Env();
      Napi::Object self = info.This().As<Napi::Object>();
      std::string body = self.Get("_body").As<Napi::String>().Utf8Value();
      auto d = Napi::Promise::Deferred::New(env);
      d.Resolve(Napi::Buffer<uint8_t>::Copy(env, reinterpret_cast<const uint8_t*>(body.data()), body.size()));
      return d.Promise();
    }));
    Napi::Function evalFn = env.Global().Get("eval").As<Napi::Function>();
    Napi::Function makeStream = evalFn.Call({ Napi::String::New(env, "(buf)=>new ReadableStream({start(c){c.enqueue(buf);c.close();}})") }).As<Napi::Function>();
    Napi::Value jsStream = makeStream.Call({ Napi::Buffer<uint8_t>::Copy(env, reinterpret_cast<const uint8_t*>(respBody.data()), respBody.size()) });
    resp.Set("body", jsStream);
    resp.Set("abort", Napi::Function::New(env, [](const Napi::CallbackInfo& info){
      return info.Env().Undefined();
    }));

    deferred.Resolve(resp);
    return deferred.Promise();
  }

  Napi::Value GetCookies(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    Napi::Array arr = Napi::Array::New(env, cookieJar.size());
    for (size_t i = 0; i < cookieJar.size(); ++i) {
      arr.Set(i, Napi::String::New(env, cookieJar[i]));
    }
    return arr;
  }

  Napi::Value SetCookies(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsArray()) {
      throw Napi::Error::New(env, "Expected an array of strings");
    }
    Napi::Array arr = info[0].As<Napi::Array>();
    cookieJar.clear();
    for (uint32_t i = 0; i < arr.Length(); ++i) {
      Napi::Value v = arr.Get(i);
      if (v.IsString()) {
        cookieJar.push_back(v.As<Napi::String>().Utf8Value());
      }
    }
    return env.Undefined();
  }

private:
  std::string browser;
  std::vector<std::string> cookieJar;
  uint32_t timeoutMs{30000};
  bool verify{true};
  std::string caPath;
  bool followRedirects{true};
  std::vector<std::pair<std::string,std::string>> defaultHeaders;
  std::string proxyUrl;
  std::string proxyUsername;
  std::string proxyPassword;
  std::string noProxy;
  bool ignoreProxyTlsErrors{false};
  bool verbose{false};
  uint32_t connectTimeoutMs{0};
  uint32_t maxRedirects{0};
  int httpVersion{0};
  std::string ipResolve;
  std::string dohUrl;
  bool ignoreDohTlsErrors{false};
  std::string userAgent;
  std::string referer;
  std::string cookieJarPath;
  std::string proxyType;
  std::string proxyAuth;
};

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  curl_global_init(CURL_GLOBAL_DEFAULT);
  exports.Set("Impit", ImpitWrapper::InitClass(env));
  return exports;
}

NODE_API_MODULE(curlcffi, Init)
