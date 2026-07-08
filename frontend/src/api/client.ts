import axios from 'axios'

const apiClient = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
})

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    // Only clear the session and redirect when we are actually online.
    // Offline, an axios request may fail with a cached 401 from a previous
    // response; kicking the user to /login while offline prevents them from
    // using the cached data they rely on when travelling without connectivity.
    if (error.response?.status === 401 && navigator.onLine) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export default apiClient
