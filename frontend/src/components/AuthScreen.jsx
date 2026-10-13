
import { useState } from 'react'
import { ArrowLeft, Eye, EyeOff, LoaderCircle, Sparkles } from 'lucide-react'
import {
  adminLogin,
  googleLogin,
  login,
  register,
} from '@/lib/auth'

const roles = [
  { value: 'creator', label: 'Creator' },
  { value: 'brand', label: 'Brand / Agency' },
  { value: 'admin', label: 'Admin' },
]

export default function AuthScreen({
  initialRole = 'brand',
  initialMode = 'login',
  onSuccess,
  onBack,
}) {
  const [role, setRole] = useState(
    roles.some((item) => item.value === initialRole)
      ? initialRole
      : 'brand',
  )
  const [mode, setMode] = useState(
    initialMode === 'register' ? 'register' : 'login',
  )
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const isAdmin = role === 'admin'
  const isRegister = mode === 'register' && !isAdmin

  function changeRole(nextRole) {
    setRole(nextRole)
    setError('')

    if (nextRole === 'admin') {
      setMode('login')
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setBusy(true)

    try {
      let result

      if (isAdmin) {
        result = await adminLogin({ email, password })
      } else if (isRegister) {
        result = await register({ name, email, password, role })
      } else {
        result = await login({ email, password, role })
      }

      if (result?.user) {
        onSuccess?.(result.user)
      } else {
        setError(
          'Authentication succeeded, but no user information was returned.',
        )
      }
    } catch (requestError) {
      setError(
        requestError.message || 'Unable to authenticate. Please try again.',
      )
    } finally {
      setBusy(false)
    }
  }

  async function handleGoogleCredential(credential) {
    setError('')
    setBusy(true)

    try {
      const result = await googleLogin({ credential, role })

      if (result?.user) {
        onSuccess?.(result.user)
      } else {
        setError(
          'Google sign-in completed, but no user information was returned.',
        )
      }
    } catch (requestError) {
      setError(requestError.message || 'Google sign-in failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="lf-auth-page">
      <section className="lf-auth-card">
        <button
          type="button"
          className="lf-auth-back"
          onClick={onBack}
        >
          <ArrowLeft size={17} />
          Back to marketplace
        </button>

        <div className="lf-auth-brand">
          <span className="lf-auth-logo">
            <Sparkles size={23} />
          </span>
          <span>Linkfluence</span>
        </div>

        <h1>{isRegister ? 'Create your account' : 'Welcome back'}</h1>

        <p className="lf-auth-subtitle">
          {isRegister
            ? 'Join the AI creator marketplace.'
            : 'Sign in to continue to Linkfluence.'}
        </p>

        <div className="lf-auth-roles" aria-label="Account type">
          {roles.map((item) => (
            <button
              key={item.value}
              type="button"
              className={role === item.value ? 'active' : ''}
              onClick={() => changeRole(item.value)}
              aria-pressed={role === item.value}
            >
              {item.label}
            </button>
          ))}
        </div>

        {!isAdmin && (
          <div className="lf-auth-mode">
            <button
              type="button"
              className={mode === 'login' ? 'active' : ''}
              onClick={() => {
                setMode('login')
                setError('')
              }}
            >
              Sign in
            </button>

            <button
              type="button"
              className={mode === 'register' ? 'active' : ''}
              onClick={() => {
                setMode('register')
                setError('')
              }}
            >
              Create account
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="lf-auth-form">
          {isRegister && (
            <label>
              Full name
              <input
                autoComplete="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Enter your name"
                required
                maxLength={100}
              />
            </label>
          )}

          <label>
            Email address
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              required
            />
          </label>

          <label>
            Password
            <span className="lf-auth-password">
              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete={
                  isRegister ? 'new-password' : 'current-password'
                }
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={
                  isRegister
                    ? 'At least 8 characters'
                    : 'Enter your password'
                }
                required
                minLength={isRegister ? 8 : undefined}
              />

              <button
                type="button"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                onClick={() => setShowPassword((value) => !value)}
              >
                {showPassword ? (
                  <EyeOff size={18} />
                ) : (
                  <Eye size={18} />
                )}
              </button>
            </span>
          </label>

          {error && (
            <p className="lf-auth-error" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            className="lf-auth-submit"
            disabled={busy}
          >
            {busy && (
              <LoaderCircle className="lf-auth-spinner" size={18} />
            )}

            {busy
              ? 'Please wait…'
              : isAdmin
                ? 'Sign in as Admin'
                : isRegister
                  ? 'Create account'
                  : 'Sign in'}
          </button>
        </form>

        {!isAdmin && (
          <div className="lf-auth-google">
            <div className="lf-auth-divider">
              <span>or continue with</span>
            </div>

            <GoogleSignIn
              onCredential={handleGoogleCredential}
              onError={setError}
              disabled={busy}
            />
          </div>
        )}

        {isAdmin && (
          <p className="lf-auth-admin-note">
            Admin access is restricted to provisioned administrator accounts.
          </p>
        )}
      </section>
    </main>
  )
}

function GoogleSignIn({ onCredential, onError, disabled }) {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID

  if (!clientId) {
    return (
      <p className="lf-auth-google-note">
        Google sign-in needs a frontend Google Client ID. Email and password
        sign-in remain available.
      </p>
    )
  }

  return (
    <GoogleButton
      clientId={clientId}
      onCredential={onCredential}
      onError={onError}
      disabled={disabled}
    />
  )
}

function GoogleButton({ clientId, onCredential, onError, disabled }) {
  const [loadingGoogle, setLoadingGoogle] = useState(false)

  async function startGoogleSignIn() {
    setLoadingGoogle(true)
    onError('')

    try {
      if (!window.google?.accounts?.id) {
        await new Promise((resolve, reject) => {
          const existing = document.querySelector(
            'script[data-linkfluence-google]',
          )

          if (window.google?.accounts?.id) {
            resolve()
            return
          }

          const script = existing || document.createElement('script')

          script.src = 'https://accounts.google.com/gsi/client'
          script.async = true
          script.defer = true
          script.dataset.linkfluenceGoogle = 'true'
          script.onload = resolve
          script.onerror = () => {
            reject(new Error('Could not load Google sign-in.'))
          }

          if (!existing) {
            document.head.appendChild(script)
          }
        })
      }

      if (!window.google?.accounts?.id) {
        throw new Error('Google sign-in could not be initialized.')
      }

      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (response) => {
          if (response.credential) {
            onCredential(response.credential)
          } else {
            onError('Google did not return a sign-in credential.')
          }
        },
      })

      window.google.accounts.id.prompt((notification) => {
        if (
          notification.isNotDisplayed() ||
          notification.isSkippedMoment()
        ) {
          onError(
            'Google sign-in was not displayed. Check your Google Client ID and authorized JavaScript origins.',
          )
        }
      })
    } catch (requestError) {
      onError(requestError.message || 'Unable to start Google sign-in.')
    } finally {
      setLoadingGoogle(false)
    }
  }

  return (
    <button
      type="button"
      className="lf-auth-google-button"
      onClick={startGoogleSignIn}
      disabled={disabled || loadingGoogle}
    >
      {loadingGoogle ? (
        <LoaderCircle className="lf-auth-spinner" size={18} />
      ) : (
        <span className="lf-auth-google-g">G</span>
      )}
      Continue with Google
    </button>
  )
}
