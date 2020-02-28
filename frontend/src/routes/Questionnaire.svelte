<script>
  export let params = {};
  import { onMount } from "svelte";
  import IconButton, { Icon } from "@smui/icon-button";

  onMount(async () => {
    //   TODO: populate the description and question link
  });
  let icons = {
    intra: "potrait",
    inter: "transfer_within_a_station"
  };
</script>

<svelte:head>
  <title>{params.type}personal - {params.name}</title>
</svelte:head>

<h1>
  {params.name} Questionnaire
  <em>
    <Icon class="material-icons">{icons[params.type]}</Icon>
  </em>
</h1>
<p>Introduction</p>
