export default defineEventHandler((event) => {
  endAdminSession(event)
  return sendNoContent(event, 204)
})
