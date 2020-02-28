<script>
  import Paper, { Title, Subtitle, Content } from "@smui/paper";
  import { fade } from "svelte/transition";
</script>

<div class="card-container long" in:fade={{ duration: 500 }}>
  <Paper color={'primary'} elevation={10}>
    <Title>Interpersonal Questionnaires</Title>
    <Content>
      The interpersonal questionnaire is responsible for modeling edges in a
      directed, weighted fashion. Think of it like node ABC having filled
      Question 3 choosing node PQR as option C (refer to the intrapersonal
      section for more information). A basic representation would be like the
      following:
      <!-- TODO: add representation here -->
    </Content>
  </Paper>
</div>
