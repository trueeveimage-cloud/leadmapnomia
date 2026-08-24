import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Building2, Mail, Lock, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';

export default function AuthPage() {
  const [mode, setMode] = useState<'login' | 'forgot'>('login');
  const [email, setEmail] = useState(() => localStorage.getItem('savedEmail') || '');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(() => localStorage.getItem('rememberMe') === 'true');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    localStorage.setItem('rememberMe', String(rememberMe));
    if (rememberMe) {
      localStorage.setItem('savedEmail', email);
    } else {
      localStorage.removeItem('savedEmail');
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) toast.error(error.message);
    setLoading(false);
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) toast.error(error.message);
    else toast.success('Password reset email sent');
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center">
            <Building2 size={18} className="text-primary-foreground" />
          </div>
          <div>
            <div className="text-lg font-bold text-foreground">Nomia CRM</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-widest">Private workspace</div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-6">
          <h2 className="text-lg font-semibold text-foreground mb-1">
            {mode === 'login' ? 'Sign in' : 'Reset password'}
          </h2>
          <p className="text-xs text-muted-foreground mb-5">
            {mode === 'login' ? 'Owner access only' : 'Enter your email to reset'}
          </p>

          <form onSubmit={mode === 'login' ? handleLogin : handleForgot} className="space-y-3">
            <div className="relative">
              <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="email"
                placeholder="Email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="pl-9 h-9 text-sm"
              />
            </div>
            {mode !== 'forgot' && (
              <div className="relative">
                <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="pl-9 h-9 text-sm"
                />
              </div>
            )}
            {mode === 'login' && (
              <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={e => setRememberMe(e.target.checked)}
                  className="rounded border-border"
                />
                Remember me
              </label>
            )}
            <Button type="submit" disabled={loading} className="w-full h-9 gap-2 text-sm">
              {loading ? 'Loading...' : mode === 'login' ? 'Sign in' : 'Send reset link'}
              <ArrowRight size={14} />
            </Button>
          </form>

          <div className="mt-4 text-center text-xs text-muted-foreground space-y-1">
            {mode === 'login' && (
              <>
                <button onClick={() => setMode('forgot')} className="hover:text-primary transition-colors block w-full">
                  Forgot password?
                </button>
              </>
            )}
            {mode === 'forgot' && (
              <button onClick={() => setMode('login')} className="hover:text-primary transition-colors">
                Back to sign in
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
