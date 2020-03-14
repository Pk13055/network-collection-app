<script>
  export let params = {};
  import { replace } from "svelte-spa-router";
  import { onMount, onDestroy, afterUpdate, getContext } from "svelte";
  import { fade } from "svelte/transition";
  import Card, { Content, Actions } from "@smui/card";
  import IconButton, { Icon } from "@smui/icon-button";
  import Chip from "@smui/chips";
  import Button, { Label } from "@smui/button";
  import Slider from "@smui/slider";
  import axios from "axios";
  import { user } from "../stores.js";

  let selected = {},
    questions = new Array(),
    options = new Array(),
    prevSelected = new Array(),
    stateSaved = true;

  let flattenState = selected => {
    let flattened = new Array(selected.length);
    for (let question in selected) flattened[question - 1] = selected[question];
    return flattened;
  };
  const iconMap = {
    1: {
      icon: "indeterminate_check_box",
      n: 1
    },
    2: {
      icon: "thumb_down",
      n: 2
    },
    3: {
      icon: "thumb_down",
      n: 1
    },
    4: {
      icon: "thumbs_up_down",
      n: 1
    },
    5: {
      icon: "thumb_up",
      n: 1
    },
    6: {
      icon: "thumb_up",
      n: 2
    }
  };
  let __quiz_type = "intra",
    __quiz_name = "Loading Quiz ...",
    successfullyLoaded = false;
  onMount(async () => {
    await fetch(`/api/core/questions/${params.name}`, {
      headers: {
        Authorization: $user.token
      }
    })
      .then(results => {
        return results.json();
      })
      .then(questionnaire => {
        console.log(questionnaire);
        if (questionnaire.errors) {
          alert("Invalid Questionnaire!");
          replace("/");
        }
        successfullyLoaded = true;
        __quiz_name = questionnaire.title;
        __quiz_type = questionnaire.type;
        questionnaire.questions.forEach(question => questions.push(question));
        questionnaire.options.forEach(option => options.push(option));
        // TODO: fetch selected from audit map
        questions.map(question => (selected[question.k] = 1));
        prevSelected = flattenState(selected);
      });
  });

  onDestroy(async () => {
    let shouldSave =
      !stateSaved && successfullyLoaded
        ? confirm(
            "You have unsaved answers. Do you want to save them before exiting?"
          )
        : false;
    if (shouldSave) await saveState();
  });

  afterUpdate(() => {
    let currentSelected = flattenState(selected);
    if (JSON.stringify(prevSelected) !== JSON.stringify(currentSelected)) {
      console.log(`Current selected: ${JSON.stringify(currentSelected)}`);
      prevSelected = currentSelected;
      stateSaved = false;
    }
  });

  let saveState = () => {
    let currentSelected = flattenState(selected);
    if (JSON.stringify(prevSelected) != JSON.stringify(currentSelected)) {
      // TODO: update the audit log
      prevSelected = currentSelected;
      stateSaved = true;
    }
  };
</script>

<svelte:head>
  <title>Attempt - {params.name}</title>
</svelte:head>

<!-- Actual questionnaire route -->
<div class="container">
  <h2 class="mdc-typography--headline2">
    <IconButton
      class="material-icons"
      on:click={saveState}
      toggle
      bind:pressed={stateSaved}>
      <Icon class="material-icons" on>turned_in</Icon>
      <Icon class="material-icons">turned_in_not</Icon>
    </IconButton>
    <Chip leading>{__quiz_type}</Chip>
    {__quiz_name}
    <IconButton
      class="material-icons"
      on:click={() => {
        for (var k in selected) selected[k] = 1;
      }}>
      rotate_right
    </IconButton>
  </h2>
  <p class="mdc-typography--caption">
    <span style="color: {stateSaved ? 'green' : 'red'}">
      {#if stateSaved}
        All changes have been saved successfully!
      {:else}Unsaved Changes (click the bookmark above to save){/if}
    </span>
  </p>
</div>
{#each questions as question}
  <div class="container" in:fade={{ duration: 400 }}>
    <Card elevation={20} color={'secondary'}>
      <Content>
        <span class="mdc-typography--subtitle">{question.description}</span>
        <Slider
          bind:value={selected[question.k]}
          min={1}
          step={1}
          max={6}
          default={1}
          discrete
          displayMarkers />
        <span class="mdc-typography--headline4">
          {#each Array(iconMap[selected[question.k]].n) as _}
            <Icon class="material-icons" leading>
              {iconMap[selected[question.k]].icon}
            </Icon>
            &nbsp;
          {/each}
          {options[selected[question.k] - 1].label}
        </span>
      </Content>
      <Actions fullBleed>
        <Button on:click={() => (selected[question.k] = 1)}>
          <Label>Reset</Label>
          <i class="material-icons" aria-hidden="true">rotate_left</i>
        </Button>
      </Actions>
    </Card>
  </div>
{/each}
<div class="container">
  <p class="mdc-typography--caption">
    <span style="color: {stateSaved ? 'green' : 'red'}">
      {#if stateSaved}
        All changes have been saved successfully!
      {:else}
        Unsaved Changes (click the bookmark
        <Button
          on:click={() => {
            document.body.scrollTop = 0;
            document.documentElement.scrollTop = 0;
          }}>
          above
        </Button>
        to save)
      {/if}
    </span>
  </p>
</div>
