// Import the "wrap" function
import { wrap } from 'svelte-spa-router'

// Components
import Home from './routes/Home.svelte'
import Renumeration from './routes/Renumeration.svelte'
import Privacy from './routes/Privacy.svelte'
import Regex from './routes/Regex.svelte'
import Questions from './routes/Questions.svelte'
import Questionnaire from './routes/Questionnaire.svelte'
import NotFound from './routes/NotFound.svelte'

// This demonstrates how to pass routes as a POJO (Plain Old JavaScript Object) or a JS Map
let routes = new Map()

// Exact path
routes.set('/', Home)
routes.set('/renumeration', Renumeration)
routes.set('/privacy', Privacy)
routes.set('/questions', Questions)
routes.set('/questions/:type/:name', Questionnaire)

// Regular expressions
routes.set(/^\/regex\/(.*)?/i, Regex)
routes.set(/^\/(pattern|match)(\/[a-z0-9]+)?/i, Regex)

// Catch-all, must be last
routes.set('*', NotFound)

export default routes
