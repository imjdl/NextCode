import type { IZCodeAgentService } from "@zcode/services";
import { useServices } from "@/hooks/useServices.js";
import { useWorkspaceServices } from "@/hooks/useWorkspaceServices.js";

export function useZCodeAgentService(
  workspacePath?: string,
  preferredRemoteSessionId?: string | null,
  workspaceIdentity?: string | null,
): IZCodeAgentService {
  // Hook 调用顺序必须无条件稳定：web/手机端加载期 workspacePath 会从空变为有值
  // （项目信息异步就位），条件分支会让两次渲染走到不同 hook 序列，React 检测到
  // Hooks 顺序变化后内部状态损坏（areHookInputsEqual 读 undefined 崩溃），
  // 子树崩溃或渲染挂死；桌面端 workspacePath 恒有值所以从未触发。
  // useWorkspaceServices 只按元数据解析目标（远程/本地），不因 workspacePath
  // 为空产生副作用，无条件调用是安全的。
  const workspaceServices = useWorkspaceServices(
    workspacePath,
    preferredRemoteSessionId,
    workspaceIdentity,
  );
  const contextServices = useServices();
  return (workspacePath ? workspaceServices : contextServices).zcodeAgentService;
}
