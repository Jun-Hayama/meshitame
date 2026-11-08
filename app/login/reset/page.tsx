'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [ready, setReady] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [isError, setIsError] = useState(false)

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') {
        setReady(true)
      }
    })

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true)
    })

    return () => subscription.unsubscribe()
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) {
      setIsError(true)
      setMessage('パスワードが一致しません')
      return
    }
    if (password.length < 6) {
      setIsError(true)
      setMessage('パスワードは6文字以上にしてください')
      return
    }

    setLoading(true)
    setMessage(null)
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)

    if (error) {
      setIsError(true)
      setMessage(error.message)
      return
    }

    setIsError(false)
    setMessage('パスワードを更新しました。ホームへ移動します…')
    const { data: { user } } = await supabase.auth.getUser()
    let hasProfile = false
    if (user) {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('id', user.id)
        .single()
      hasProfile = !!profile
    }
    setTimeout(() => {
      router.replace(hasProfile ? '/' : '/settings/profile')
    }, 800)
  }

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 flex flex-col justify-center px-6">
      <div className="max-w-sm mx-auto w-full">
        <header className="mb-10 text-center">
          <h1 className="text-4xl font-bold tracking-tight mb-2">
            <span className="text-amber-400">メシ</span>ため
          </h1>
          <p className="text-stone-500 text-sm">新しいパスワードを設定</p>
        </header>

        {!ready ? (
          <p className="text-stone-500 text-sm text-center">
            メールのリンクから開いてください。リンクが無効な場合は、ログイン画面から再設定メールを送り直してください。
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="password" className="text-stone-500 text-xs mb-1.5 block">
                新しいパスワード
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
                className="w-full bg-stone-900 border border-stone-800 rounded-2xl px-4 py-3 text-sm text-stone-100 placeholder:text-stone-600 focus:outline-none focus:border-amber-400/50"
                placeholder="6文字以上"
              />
            </div>
            <div>
              <label htmlFor="confirm" className="text-stone-500 text-xs mb-1.5 block">
                パスワード（確認）
              </label>
              <input
                id="confirm"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
                className="w-full bg-stone-900 border border-stone-800 rounded-2xl px-4 py-3 text-sm text-stone-100 placeholder:text-stone-600 focus:outline-none focus:border-amber-400/50"
                placeholder="もう一度入力"
              />
            </div>

            {message && (
              <p className={`text-sm px-1 ${isError ? 'text-rose-400' : 'text-amber-400'}`}>
                {message}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-amber-400 text-stone-950 font-bold py-3.5 rounded-2xl text-sm disabled:opacity-50"
            >
              {loading ? '更新中...' : 'パスワードを更新'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
