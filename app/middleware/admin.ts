import type { SessionInfo } from '#shared/types/api'

// Guards every panel page but the login. The session lives in an httpOnly
// cookie, so during SSR the request's cookies are forwarded to the API.
export default defineNuxtRouteMiddleware(async (to) => {
  const fetcher = useRequestFetch()
  const session = await fetcher<SessionInfo>('/api/auth/session').catch(() => null)
  if (!session?.authenticated)
    return navigateTo({ path: '/panel/acceso', query: { redirect: to.fullPath } })
})
