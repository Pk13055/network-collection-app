<script>
  import Paper, { Title, Subtitle, Content } from "@smui/paper";
  import { fade } from "svelte/transition";
</script>

<div class="card-container long" in:fade={{ duration: 500 }}>
  <Paper color={'primary'} elevation={10}>
    <Title>Intrapersonal Questionnaires</Title>
    <Content>
      Intrapersonal questionnaires are responsible for adding intrinsic value to
      each node. The questionnaires are quantized into various metrics
      (mentioned below) and used to assign a score vector to each node, an
      embedding, of sorts.
    </Content>
  </Paper>
</div>
