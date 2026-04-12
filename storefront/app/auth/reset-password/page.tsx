'use client'

import { useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { getMedusaClient } from '@/lib/medusa-client'
import { toast } from 'sonner'

function ResetPasswordForm() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const token = searchParams.get('token')
  const email = searchParams.get('email')

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  if (!token) {
    return (
      <div className="container-custom py-section">
        <div className="max-w-sm mx-auto text-center">
          <AlertCircle className="h-10 w-10 mx-auto mb-4 text-muted-foreground" strokeWidth={1.5} />
          <h1 className="text-h2 font-heading font-semibold">Invalid Reset Link</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            This password reset link is invalid or has expired. Please request a new one.
          </p>
          <Link
            href="/auth/forgot-password"
            className="mt-6 inline-block text-sm font-semibold underline underline-offset-4"
          >
            Request new reset link
          </Link>
        </div>
      </div>
    )
  }

  if (success) {
    return (
      <div className="container-custom py-section">
        <div className="max-w-sm mx-auto text-center">
          <CheckCircle2 className="h-10 w-10 mx-auto mb-4 text-green-600" strokeWidth={1.5} />
          <h1 className="text-h2 font-heading font-semibold">Password Updated</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Your password has been reset successfully. You can now sign in with your new password.
          </p>
          <button
            onClick={() => router.push(`/auth/login${email ? `?email=${encodeURIComponent(email)}` : ''}`)}
            className="mt-6 bg-foreground text-background px-8 py-3.5 text-sm font-semibold uppercase tracking-wide hover:opacity-90 transition-opacity"
          >
            Sign In
          </button>
        </div>
      </div>
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (password.length < 8) {
      toast.error('Password must be at least 8 characters')
      return
    }

    if (password !== confirmPassword) {
      toast.error('Passwords do not match')
      return
    }

    setLoading(true)
    try {
      await getMedusaClient().auth.updateProvider(
        'customer',
        'emailpass',
        { password },
        token,
      )
      setSuccess(true)
    } catch (err: any) {
      toast.error(err?.message || 'Failed to reset password. The link may have expired.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container-custom py-section">
      <div className="max-w-sm mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-h2 font-heading font-semibold">New Password</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Choose a new password for your account
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-xs uppercase tracking-widest font-semibold mb-2">
              New Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              autoFocus
              className="w-full border-b border-foreground/20 bg-transparent px-0 py-3 text-sm placeholder:text-muted-foreground focus:border-foreground focus:outline-none transition-colors"
              placeholder="At least 8 characters"
            />
          </div>

          <div>
            <label className="block text-xs uppercase tracking-widest font-semibold mb-2">
              Confirm Password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              className="w-full border-b border-foreground/20 bg-transparent px-0 py-3 text-sm placeholder:text-muted-foreground focus:border-foreground focus:outline-none transition-colors"
              placeholder="Re-enter your password"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-foreground text-background py-3.5 text-sm font-semibold uppercase tracking-wide hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Resetting...
              </>
            ) : (
              'Reset Password'
            )}
          </button>
        </form>

        <p className="mt-8 text-center">
          <Link
            href="/auth/login"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="container-custom py-section text-center">
          <Loader2 className="h-6 w-6 animate-spin mx-auto" />
        </div>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  )
}
