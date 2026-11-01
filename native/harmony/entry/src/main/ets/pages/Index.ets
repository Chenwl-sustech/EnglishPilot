import { webview } from '@kit.ArkWeb';
import { abilityAccessCtrl, common } from '@kit.AbilityKit';
import { picker } from '@kit.CoreFileKit';
import { util } from '@kit.ArkTS';
import { bundledResourcePath } from '../ResourcePath';
import { ExportBridge } from '../ExportBridge';

interface ResourceEntry { file: string; mime: string; bytes: number; sha256: string; }
interface ResourceManifest { version: number; origin: string; resources: Record<string, ResourceEntry>; }
const APP_ORIGIN: string = 'https://englishpilot.local';

@CustomDialog
struct WebPrompt {
  controller?: CustomDialogController;
  message: string = '';
  @State value: string = '';
  complete: (value: string | null) => void = () => {};

  build() {
    Column({ space: 16 }) {
      Text('EnglishPilot').fontSize(20).fontWeight(FontWeight.Bold)
      Text(this.message).width('100%')
      TextInput({ text: this.value, placeholder: '请输入内容' })
        .onChange((value: string) => { this.value = value; })
      Row({ space: 24 }) {
        Button('取消').onClick(() => { this.complete(null); this.controller?.close(); })
        Button('确认').onClick(() => { this.complete(this.value); this.controller?.close(); })
      }
    }.padding(24).width('100%')
  }
}

@Entry
@Component
struct Index {
  private controller: webview.WebviewController = new webview.WebviewController();
  private files: ExportBridge = new ExportBridge(this.controller, () => this.getUIContext().getHostContext() as common.UIAbilityContext);
  private manifest: ResourceManifest = { version: 1, origin: APP_ORIGIN, resources: {} };
  private cancelDialog: (() => void) | null = null;
  private promptDialog: CustomDialogController | null = null;
  @State error: string = '';

  aboutToAppear(): void {
    try {
      const context = this.getUIContext().getHostContext() as common.UIAbilityContext;
      webview.WebviewController.setWebDebuggingAccess(context.applicationInfo.debug);
      const manager = context.resourceManager;
      const data = manager.getRawFileContentSync('web/native-resources.json');
      this.manifest = JSON.parse(new util.TextDecoder('utf-8').decodeToString(data)) as ResourceManifest;
      if (this.manifest.version !== 1 || this.manifest.origin !== APP_ORIGIN) throw new Error('Invalid resource manifest');
    } catch { this.error = '内置学习资源不完整，请重新生成并安装应用；已有学习记录不会在此操作中清空。'; }
  }

  aboutToDisappear(): void {
    this.cancelDialog?.();
    this.promptDialog?.close();
    this.files.dispose();
    try { this.controller.deleteJavaScriptRegister('EnglishPilotBridge'); } catch {}
  }

  onBackPress(): boolean {
    try {
      if (this.controller.accessBackward()) {
        this.controller.backward();
        return true;
      }
    } catch {}
    return false;
  }

  private resource(url: string): WebResourceResponse {
    const response = new WebResourceResponse();
    const path = bundledResourcePath(url, APP_ORIGIN);
    const entry = path === null ? undefined : (this.manifest.resources[path] ?? this.manifest.resources[`${path.replace(/\/$/, '')}/index.html`]);
    if (!entry) {
      response.setResponseCode(404);
      response.setReasonMessage('Not Found');
      response.setResponseMimeType('text/plain');
      response.setResponseData('Resource unavailable');
      return response;
    }
    try {
      const bytes = this.getUIContext().getHostContext()!.resourceManager.getRawFileContentSync(`web/${entry.file}`);
      response.setResponseData(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
      response.setResponseCode(200);
      response.setReasonMessage('OK');
      response.setResponseMimeType(entry.mime);
      response.setResponseEncoding('utf-8');
      response.setResponseHeader([
        { headerKey: 'X-Content-Type-Options', headerValue: 'nosniff' },
        { headerKey: 'Content-Security-Policy', headerValue: "default-src 'self' data: blob:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-src 'none'; object-src 'none'" }
      ]);
    } catch {
      response.setResponseCode(500);
      response.setReasonMessage('Local Resource Error');
      response.setResponseData('Cannot read bundled resource');
    }
    return response;
  }

  private async microphone(request: PermissionRequest): Promise<void> {
    const resources = request.getAccessibleResource();
    if (request.getOrigin().replace(/\/$/, '') !== APP_ORIGIN || resources.length !== 1 || resources[0] !== ProtectedResourceType.AUDIO_CAPTURE) { request.deny(); return; }
    try {
      const result = await abilityAccessCtrl.createAtManager().requestPermissionsFromUser(this.getUIContext().getHostContext() as common.UIAbilityContext, ['ohos.permission.MICROPHONE']);
      if (result.authResults.length === 1 && result.authResults[0] === 0) request.grant(resources);
      else request.deny();
    } catch { request.deny(); }
  }

  build() {
    Column() {
      if (this.error) {
        Text(this.error).padding(24)
      } else {
        Web({ src: APP_ORIGIN + '/', controller: this.controller })
          .javaScriptAccess(true)
          .domStorageAccess(true)
          .databaseAccess(true)
          .onPageBegin(() => {
            this.cancelDialog?.();
            this.promptDialog?.close();
            this.files.resetDocument();
          })
          .fileAccess(false)
          .mixedMode(MixedMode.None)
          .javaScriptProxy({
            object: this.files, name: 'EnglishPilotBridge', methodList: ['postMessage'], controller: this.controller,
            permission: '{"javascriptProxyPermission":{"urlPermissionList":[{"scheme":"https","host":"englishpilot.local","port":"","path":""}]}}'
          })
          .onInterceptRequest((event) => {
            if (!event) return null;
            const url = event.request.getRequestUrl();
            if (url.startsWith('blob:' + APP_ORIGIN + '/') || url.startsWith('data:')) return null;
            return this.resource(url);
          })
          .onLoadIntercept((event) => !!event && bundledResourcePath(event.data.getRequestUrl(), APP_ORIGIN) === null)
          .onPermissionRequest((event) => { if (event) this.microphone(event.request); })
          .onConfirm((event) => {
            if (!event) return false;
            if (bundledResourcePath(event.url, APP_ORIGIN) === null || this.cancelDialog !== null) {
              event.result.handleCancel(); return true;
            }
            let resolved = false;
            const finish = (accepted: boolean): void => {
              if (resolved) return;
              resolved = true;
              this.cancelDialog = null;
              if (accepted) event.result.handleConfirm(); else event.result.handleCancel();
            };
            this.cancelDialog = () => finish(false);
            try {
              this.getUIContext().showAlertDialog({
                title: 'EnglishPilot', message: event.message, autoCancel: true,
                cancel: () => finish(false),
                primaryButton: { value: '取消', action: () => finish(false) },
                secondaryButton: { value: '确认', action: () => finish(true) }
              });
            } catch { finish(false); }
            return true;
          })
          .onPrompt((event) => {
            if (!event) return false;
            if (bundledResourcePath(event.url, APP_ORIGIN) === null || this.cancelDialog !== null) {
              event.result.handleCancel(); return true;
            }
            let resolved = false;
            const finish = (value: string | null): void => {
              if (resolved) return;
              resolved = true;
              this.cancelDialog = null;
              if (value === null) event.result.handleCancel(); else event.result.handlePromptConfirm(value);
            };
            this.cancelDialog = () => finish(null);
            try {
              this.promptDialog = new CustomDialogController({
                builder: WebPrompt({ message: event.message, value: event.value, complete: finish }),
                autoCancel: true, cancel: () => finish(null)
              });
              this.promptDialog.open();
            } catch { finish(null); }
            return true;
          })
          .onShowFileSelector((event) => {
            if (!event) return false;
            const options = new picker.DocumentSelectOptions();
            options.maxSelectNumber = 1;
            new picker.DocumentViewPicker(this.getUIContext().getHostContext() as common.UIAbilityContext).select(options)
              .then((uris: string[]) => event.result.handleFileList(uris))
              .catch(() => event.result.handleFileList([]));
            return true;
          })
          .width('100%').height('100%')
      }
    }.width('100%').height('100%')
  }
}
