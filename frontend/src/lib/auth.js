
const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'

async function authRequest(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    const error = new Error(
      data.message || `Request failed with status ${response.status}`,
    )
    error.status = response.status
    error.data = data
    throw error
  }

  return data
}

export function register({ name, email, password, role }) {
  return authRequest('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name, email, password, role }),
  })
}

export function login({ email, password, role }) {
  return authRequest('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password, role }),
  })
}

export function adminLogin({ email, password }) {
  return authRequest('/api/auth/admin/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
}

export function googleLogin({ credential, role }) {
  return authRequest('/api/auth/google', {
    method: 'POST',
    body: JSON.stringify({ credential, role }),
  })
}

export function getCurrentUser() {
  return authRequest('/api/auth/me', {
    method: 'GET',
  })
}

export function logout() {
  return authRequest('/api/auth/logout', {
    method: 'POST',
  })
}

export { API_BASE_URL }
