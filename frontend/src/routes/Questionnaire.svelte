<script context="module">
  const md = window.markdownit();

  let icons = {
    intra: "portrait",
    inter: "transfer_within_a_station"
  };

  let __content;
</script>

<script>
  export let params = {};
  import { onMount, afterUpdate } from "svelte";
  import Chip from "@smui/chips";
  import Card, { Content, Actions } from "@smui/card";
  import Button, { Label } from "@smui/button";
  import { link, push } from "svelte-spa-router";
  import { fade } from "svelte/transition";
  import { readable } from "svelte/store";
  import IconButton, { Icon } from "@smui/icon-button";

  $: document.title = `${params.type}personal - ${params.name}`;

  let __type, __id, icon, content;

  onMount(async () => {
    await fetch(`https://api.github.com/gists/d1c4dc0a76d3c844ff00cb57d9bc5b33`)
      .then(results => {
        return results.json();
      })
      .then(data => {
        __content = data.files;
        content = md.render(__content[`${__id}.md`].content);
      })
      .catch(err => console.log(err));
    content = "";
  });

  $: (__type = params.type), (__id = params.name), (icon = icons[__type]);

  afterUpdate(() => {
    console.log(params);
    if (__content) content = md.render(__content[`${__id}.md`].content);
  });
</script>

<svelte:head>
  <title>{params.type}personal - {params.name}</title>
</svelte:head>

<div class="card-container">
  <Card elevation={10}>
    <Content>
      <h2 class="mdc-typography--headline2">
        {__id}
        <Chip>
          <Icon class="material-icons" leading>{icon}</Icon>
          {__type}
        </Chip>
      </h2>
      {@html content}
    </Content>
    <Actions fullBleed>
      <Button on:click={() => push(`/attempt/${__type}/${__id}`)}>
        <Label>Attempt Questionnaire!</Label>
        <i class="material-icons" aria-hidden="true">arrow_forward</i>
      </Button>
    </Actions>
  </Card>
</div>
