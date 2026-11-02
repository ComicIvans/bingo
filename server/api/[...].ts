// Unknown API paths, or a method a route does not take, get a JSON 404 in
// Spanish instead of the app's page-not-found error.
export default defineEventHandler(() => {
  throw apiError(404, 'Esa dirección de la API no existe.')
})
