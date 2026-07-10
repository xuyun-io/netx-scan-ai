import { useState } from 'react';
import { Bot, Eye, EyeOff, Loader2, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

interface LoginPageProps {
  onLogin: (username: string, password: string) => Promise<void>;
  error?: string | null;
  loading?: boolean;
}

export function LoginPage({ onLogin, error, loading = false }: LoginPageProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!username.trim() || !password.trim() || loading) return;
    await onLogin(username.trim(), password.trim());
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#111821] p-4">
      <div className="w-full max-w-[420px]">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#12a8ff] to-[#8378ff] shadow-lg shadow-[#8378ff]/20">
            <Bot className="h-7 w-7 text-white" />
          </div>
          <h1 className="agent-gradient-title text-2xl font-bold tracking-tight">
            Delegate work to NetX Agent
          </h1>
          <p className="mt-2 text-sm text-[#6b7785]">登录以继续访问 Agent 工作空间</p>
        </div>

        <div className="rounded-2xl border border-[#232d3b] bg-[#161f2a] p-6 shadow-2xl shadow-black/20">
          <div className="mb-5 flex items-center gap-2 text-sm font-medium text-[#9fa8b7]">
            <Shield className="h-4 w-4 text-[#70c4d5]" />
            需要身份验证
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">用户名</Label>
              <Input
                id="username"
                type="text"
                autoComplete="username"
                placeholder="请输入用户名"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">密码</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="请输入密码"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  disabled={loading}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6b7785] transition hover:text-[#9fa8b7]"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="rounded-md border border-red-400/20 bg-red-950/40 px-3 py-2 text-sm text-red-200">
                {error}
              </div>
            )}

            <Button
              type="submit"
              disabled={loading || !username.trim() || !password.trim()}
              className={cn(
                'h-10 w-full rounded-md text-sm font-semibold text-white transition',
                'bg-gradient-to-r from-[#12a8ff] to-[#8378ff] hover:opacity-90',
                'disabled:opacity-50 disabled:cursor-not-allowed',
              )}
            >
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {loading ? '登录中...' : '登录'}
            </Button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-[#5c6673]">
          由管理员通过配置文件配置登录凭据
        </p>
      </div>
    </div>
  );
}
