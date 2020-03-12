// Import the "wrap" function
import { wrap } from 'svelte-spa-router'

// Components
import Home from './routes/Home.svelte'
import Renumeration from './routes/Renumeration.svelte'
import Privacy from './routes/Privacy.svelte'
// import Regex from './routes/Regex.svelte'
import Questions from './routes/Questions.svelte'
import Questionnaire from './routes/Questionnaire.svelte'
import Quiz from './routes/Quiz.svelte'
import NotFound from './routes/NotFound.svelte'
import { user } from './stores'

let routes = new Map()

routes.set('/', Home)
routes.set('/attempt/:type/:name', wrap(Quiz,
    (detail) => {
        let logged_in = false;
        user.subscribe(resp => logged_in = resp.success);
        return logged_in;
    }))
routes.set('/renumeration', Renumeration)
routes.set('/privacy', Privacy)
routes.set('/questions', Questions)
routes.set('/questions/:type/:name', Questionnaire)

// Regular expressions
// routes.set(/^\/regex\/(.*)?/i, Regex)
// routes.set(/^\/(pattern|match)(\/[a-z0-9]+)?/i, Regex)

// Catch-all, must be last
routes.set('*', NotFound)

export default routes
