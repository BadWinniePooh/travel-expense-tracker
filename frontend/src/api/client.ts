import axios from 'axios'

const apiClient = axios.create({
  baseURL: '/api',
  adapter: 'fetch', // required: service workers only intercept the Fetch API, not XHR
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor: attach JWT token
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Response interceptor:
//  - 401 → clear auth and redirect to login
//  - 202 X-Sync-Queued → notify SyncContext that a mutation was queued offline
apiClient.interceptors.response.use(
  (response) => {
    if (
      response.status === 202 &&
      response.headers['x-sync-queued'] === 'true'
    ) {
      window.dispatchEvent(new CustomEvent('sync-queued'))
    }
    return response
  },
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export default apiClient
