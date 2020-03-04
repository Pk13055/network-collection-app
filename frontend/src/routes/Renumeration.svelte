<script>
  import { link } from "svelte-spa-router";
  import Paper, { Title, Subtitle, Content } from "@smui/paper";
  import { fade } from "svelte/transition";

  export const title = "Renumeration";
</script>

<div class="card-container long" in:fade={{ duration: 500 }}>
  <Paper color={'default'} elevation={10}>
    <Title>Renumeration</Title>
    <Content>
      <p>
        All participants of the anonymous questionnaire will be renumerated for
        their time invested. Read the about sections of each questionnaire for
        further details. (PS - Read the
        <a href="/privacy" use:link>privacy section</a>
        is maintained even though remuneration will be carried out for every
        valid participant)
      </p>
      <Subtitle>Raffle Token System</Subtitle>
      <p>
        The raffle token system exists to motivate people to fill in the entire
        research dataset and moreover, highlight the secureness of the
        anonymization (gone into more detail in the privacy section). In
        essence, if any of the questionnaires are filled in full (indicated by
        number of tickets on your dashboard), you are automatically entered into
        a large scale Amazon/Sponsor raffle draw for a gift voucher. Remeber,
        this is in addition to the individual renumeration you get for each
        questionnaire.
      </p>
    </Content>
  </Paper>
</div>
