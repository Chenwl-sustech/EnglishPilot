import UIKit
import Capacitor
import Security

// This app exports multiple HTML documents, rather than a single-page index.
// Capacitor's default extensionless routing would silently serve today's page.
private struct BundledResource: Decodable {
    let file: String
}

private struct BundledManifest: Decodable {
    let version: Int
    let resources: [String: BundledResource]
}

private final class EnglishPilotRouter: Router {
    private var resources: [String: BundledResource] = [:]
    var basePath: String = "" {
        didSet {
            let url = URL(fileURLWithPath: basePath).appendingPathComponent("native-resources.json")
            if let data = try? Data(contentsOf: url),
               let manifest = try? JSONDecoder().decode(BundledManifest.self, from: data),
               manifest.version == 1 {
                resources = manifest.resources
            } else {
                resources = [:]
            }
        }
    }

    func route(for path: String) -> String {
        // Foundation reports an empty path for the initial capacitor://localhost URL.
        let path = path.isEmpty ? "/" : path
        let missing = basePath + "/__englishpilot_missing_resource__"
        guard path.hasPrefix("/"), !path.contains("\\"),
              !path.split(separator: "/").contains("..") else { return missing }
        let directory = path.hasSuffix("/") ? path : path + "/"
        guard let entry = resources[path] ?? resources[directory + "index.html"],
              !entry.file.hasPrefix("/"), !entry.file.contains("\\"),
              !entry.file.split(separator: "/").contains("..") else { return missing }
        return basePath + "/" + entry.file
    }
}

class EnglishPilotViewController: CAPBridgeViewController {
    override func router() -> Router { EnglishPilotRouter() }
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(EnglishPilotAiPlugin())
        bridge?.registerPluginInstance(EnglishPilotAccountSessionPlugin())
    }
}

@objc(EnglishPilotAccountSessionPlugin)
class EnglishPilotAccountSessionPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "EnglishPilotAccountSessionPlugin"
    let jsName = "EnglishPilotAccountSession"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "get", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "set", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "remove", returnType: CAPPluginReturnPromise)
    ]
    private func query(_ call: CAPPluginCall) -> [String: Any]? {
        guard let page = bridge?.webView?.url, page.scheme == "capacitor", page.host == "localhost",
              let key = call.getString("key"), key.range(of: "^englishpilot-auth-[a-z0-9-]{1,100}$", options: .regularExpression) != nil else {
            call.reject("账号会话存储请求无效。")
            return nil
        }
        return [kSecClass as String: kSecClassGenericPassword,
                kSecAttrService as String: "com.englishpilot.account-sync",
                kSecAttrAccount as String: key]
    }
    @objc func get(_ call: CAPPluginCall) {
        guard var fields = query(call) else { return }
        fields[kSecReturnData as String] = true
        fields[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        let status = SecItemCopyMatching(fields as CFDictionary, &item)
        if status == errSecItemNotFound { call.resolve(["value": NSNull()]); return }
        guard status == errSecSuccess, let data = item as? Data,
              let value = String(data: data, encoding: .utf8) else { call.reject("无法读取账号会话，请解锁设备后重试。"); return }
        call.resolve(["value": value])
    }
    @objc func set(_ call: CAPPluginCall) {
        guard let fields = query(call) else { return }
        guard let value = call.getString("value"), value.utf8.count <= 524288 else { call.reject("账号会话过大或无效。"); return }
        let data: [String: Any] = [kSecValueData as String: Data(value.utf8),
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly]
        var status = SecItemUpdate(fields as CFDictionary, data as CFDictionary)
        if status == errSecItemNotFound { status = SecItemAdd(fields.merging(data, uniquingKeysWith: { _, new in new }) as CFDictionary, nil) }
        guard status == errSecSuccess else { call.reject("无法安全保存账号会话，请解锁设备后重试。"); return }
        call.resolve()
    }
    @objc func remove(_ call: CAPPluginCall) {
        guard let fields = query(call) else { return }
        let status = SecItemDelete(fields as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else { call.reject("无法移除账号会话，请解锁设备后重试。"); return }
        call.resolve()
    }
}

private struct AiConnection: Codable {
    let origin: String
    let deviceToken: String
    let siteToken: String
}

private final class NoAiRedirect: NSObject, URLSessionTaskDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask,
                    willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest,
                    completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
    }
}

@objc(EnglishPilotAiPlugin)
class EnglishPilotAiPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "EnglishPilotAiPlugin"
    let jsName = "EnglishPilotAI"
    let pluginMethods: [CAPPluginMethod] = [CAPPluginMethod(name: "request", returnType: CAPPluginReturnPromise)]
    private static let cloudOrigin = "https://your-englishpilot-ai.vercel.app"
    private static let allowedPaths = Set(["/api/evaluate", "/api/teacher", "/api/configuration", "/api/ai-usage"])
    private static var keychainQuery: [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: "com.example.englishpilot.online-ai",
         kSecAttrAccount as String: "primary"]
    }
    private static func error(_ text: String) -> NSError {
        NSError(domain: "EnglishPilotAI", code: 1, userInfo: [NSLocalizedDescriptionKey: text])
    }
    private static func validate(_ data: Data) throws -> AiConnection {
        guard data.count <= 16384,
              let value = try? JSONDecoder().decode(AiConnection.self, from: data),
              value.origin == cloudOrigin,
              value.deviceToken.count >= 32, value.deviceToken.count <= 4096,
              value.siteToken.isEmpty,
              !value.deviceToken.contains(where: { $0.isWhitespace }),
              !value.siteToken.contains(where: { $0.isWhitespace }) else {
            throw error("设备 AI 连接配置无效，请重新配对。")
        }
        return value
    }
    private static func connection() throws -> AiConnection {
        let caches = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        var file = caches.appendingPathComponent("englishpilot-ai-connection.json")
        if FileManager.default.fileExists(atPath: file.path) {
            try FileManager.default.setAttributes([.protectionKey: FileProtectionType.complete], ofItemAtPath: file.path)
            var values = URLResourceValues(); values.isExcludedFromBackup = true
            try file.setResourceValues(values)
            let data = try Data(contentsOf: file)
            let value = try validate(data)
            let fields: [String: Any] = [kSecValueData as String: data,
                kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly]
            var status = SecItemUpdate(keychainQuery as CFDictionary, fields as CFDictionary)
            if status == errSecItemNotFound {
                status = SecItemAdd(keychainQuery.merging(fields, uniquingKeysWith: { _, new in new }) as CFDictionary, nil)
            }
            guard status == errSecSuccess else { throw error("无法保存设备 AI 凭据，请解锁设备后重试。") }
            try FileManager.default.removeItem(at: file)
            return value
        }
        var query = keychainQuery
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data else {
            throw error("安装版尚未配置在线 AI 连接，请完成设备配对。")
        }
        return try validate(data)
    }
    override func load() { _ = try? Self.connection() }

    @objc func request(_ call: CAPPluginCall) {
        guard let page = bridge?.webView?.url,
              page.scheme == "capacitor", page.host == "localhost",
              let path = call.getString("path"), Self.allowedPaths.contains(path),
              let method = call.getString("method"), ["GET", "POST"].contains(method) else {
            call.reject("不接受此在线接口请求。")
            return
        }
        do {
            let connection = try Self.connection()
            var request = URLRequest(url: URL(string: connection.origin + path)!)
            request.httpMethod = method
            request.setValue("Bearer " + connection.deviceToken, forHTTPHeaderField: "Authorization")
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.setValue("application/json", forHTTPHeaderField: "Accept")
            if let body = call.getString("body") {
                guard method == "POST", body.utf8.count <= 200000 else { throw Self.error("AI 请求过大或请求方式无效。") }
                request.httpBody = Data(body.utf8)
            }
            let configuration = URLSessionConfiguration.ephemeral
            configuration.timeoutIntervalForRequest = 75
            configuration.timeoutIntervalForResource = 90
            configuration.httpShouldSetCookies = false
            configuration.urlCache = nil
            let session = URLSession(configuration: configuration)
            Task {
                defer { session.invalidateAndCancel() }
                do {
                    let (bytes, response) = try await session.bytes(for: request, delegate: NoAiRedirect())
                    guard let http = response as? HTTPURLResponse,
                          http.url?.scheme == "https", http.url?.host == URL(string: connection.origin)?.host,
                          !(300..<400).contains(http.statusCode),
                          http.value(forHTTPHeaderField: "Content-Type")?.lowercased().contains("application/json") == true else {
                        throw Self.error("后端未返回有效接口响应，请检查网络或设备访问授权。")
                    }
                    var data = Data()
                    for try await byte in bytes {
                        guard data.count < 2 * 1024 * 1024 else { throw Self.error("AI 响应超过大小上限。") }
                        data.append(byte)
                    }
                    guard let text = String(data: data, encoding: .utf8) else { throw Self.error("AI 响应编码无效。") }
                    call.resolve(["status": http.statusCode, "body": text])
                } catch {
                    let message = (error as NSError).domain == "EnglishPilotAI" ? error.localizedDescription : "在线后端连接失败或超时；已保存的文字和录音仍保留，请检查网络后重试。"
                    call.reject(message)
                }
            }
        } catch {
            call.reject((error as NSError).domain == "EnglishPilotAI" ? error.localizedDescription : "设备 AI 连接不可用，请解锁设备后重试。")
        }
    }
}

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = EnglishPilotViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
