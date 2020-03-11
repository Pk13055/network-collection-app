<script>
  import Paper, { Title, Subtitle, Content } from "@smui/paper";
  import { link } from "svelte-spa-router";
  import { fade } from "svelte/transition";
  export const title = "Introduction";
</script>

<div class="container" in:fade={{ duration: 300 }}>
  <Paper color={'primary'} elevation={10}>
    <Title>Introduction</Title>
    <Content>
      <p>
        This research aims to understand .. how depression trends exist in
        social networks. A network can be modeled simply as a collection of
        weighted nodes and directed edges. We plan to collect invasive,
        anonymous (see
        <a use:link href="/privacy">data privacy</a>
        ) information through a set of questionnaires to model social structure.
        This anonymous network will then be subjected to trend analysis and
        modeling. Given that time is sparse and everyone has a lot on their
        plate, any valid participation in the study will be
        <a use:link href="/renumeration">renumerated</a>
        .
      </p>
      <p />
    </Content>
  </Paper>
</div>

<div class="container" in:fade={{ duration: 700 }}>
  <Paper color={'secondary'} elevation={5}>
    <Title>
      Reach out
      <em>(About the authors)</em>
    </Title>
    <Content>
      The team behind this research consists of
      <ul>
        <li>Dr. Vinoo Alluri</li>
        <li>Dr. Praveen Parchuri</li>
        <li>Pratik Kamble</li>
        <li>Saumya Srivastava</li>
      </ul>
    </Content>
  </Paper>
</div>
