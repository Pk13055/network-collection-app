<script>
  import { link } from "svelte-spa-router";
</script>

<h1 class="routetitle">Not Found (404)!</h1>

<p>
  Oops, this route doesn't exist or
  <em>may</em>
  have been removed for updates!
  <a href="javascript:void(0)" on:click={() => window.location.reload()}>
    Refresh
  </a>
  this page or go back
  <a href="/" use:link>home</a>
  .
</p>
