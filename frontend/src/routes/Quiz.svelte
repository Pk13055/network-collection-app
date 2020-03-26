<script>
  export let params = {};
  import { replace } from "svelte-spa-router";
  import { onMount, onDestroy, afterUpdate, getContext } from "svelte";
  import { fade } from "svelte/transition";
  import Card, { Content, Actions } from "@smui/card";
  import IconButton, { Icon } from "@smui/icon-button";
  import Chip from "@smui/chips";
  // import Snackbar from "@smui/snackbar";
  import Button, { Label } from "@smui/button";
  import Slider from "@smui/slider";
  import axios from "axios";
  import { user } from "../stores.js";

  let selected = {},
    optionMap = {},
    labelMap = {},
    stateMap = {},
    questions = new Array(),
    options = new Array(),
    prevSaved = {},
    stateSaved = true,
    stateSnackbar;

  const iconMap = {
    0: { icon: "indeterminate_check_box", n: 1 },
    1: { icon: "thumb_down", n: 2 },
    2: { icon: "thumb_down", n: 1 },
    3: { icon: "thumbs_up_down", n: 1 },
    4: { icon: "thumb_up", n: 1 },
    5: { icon: "thumb_up", n: 2 },
    6: { icon: "thumb_up", n: 3 }
  };
  let __quiz_type = "intra",
    __quiz_name = "Loading Quiz ...",
    successfullyLoaded = false;

  let stateChange = async (oldState, curState) =>
    !(JSON.stringify(oldState) == JSON.stringify(curState));

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
        if (questionnaire.errors) {
          alert("Invalid Questionnaire!");
          replace("/");
        }
        successfullyLoaded = true;

        // setup the basic page layout
        __quiz_name = questionnaire.title;
        __quiz_type = questionnaire.type;
        questions = questionnaire.questions;
        options = questionnaire.options;

        options.forEach(
          option => (
            (optionMap[option._id] = option),
            (stateMap[option.k] = option._id),
            (labelMap[option._id] = option.label)
          )
        );

        // set questions to last saved options
        fetch(`/api/core/state/${params.name}`, {
          headers: { Authorization: $user.token }
        })
          .then(resp => {
            return resp.json();
          })
          .then(stateWrapper => {
            let state = stateWrapper.state;
            for (let id in state) selected[id] = optionMap[state[id]].k;
            prevSaved = { ...selected };
            stateSaved = true;
          });
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

  afterUpdate(async () => {
    stateSaved = !(
      successfullyLoaded && (await stateChange(prevSaved, selected))
    );
  });

  let saveState = async () => {
    if (await stateChange(prevSaved, selected)) {
      let state = {};
      Object.keys(selected).forEach(
        q_key => (state[q_key] = stateMap[selected[q_key]])
      );
      await fetch(`/api/core/state/${params.name}`, {
        method: "POST",
        headers: {
          Authorization: $user.token,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          state: state
        })
      })
        .then(resp => {
          return resp.json();
        })
        .then(save => {
          if (save.success) {
            prevSaved = { ...selected };
            stateSaved = true;
            stateSnackbar.open();
          }
        })
        .catch(err => {
          console.log(err);
        });
    } else {
      prevSaved = { ...selected };
      stateSaved = true;
    }
  };
</script>

<svelte:head>
  <title>Attempt - {params.name}</title>
</svelte:head>

<!-- Actual questionnaire route -->
<section id={params.name}>
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
          for (var k in selected) selected[k] = prevSaved[k];
        }}>
        rotate_right
      </IconButton>
    </h2>
    <p class="mdc-typography--caption">
      <span style="color: {stateSaved ? 'green' : 'red'}">
        {#if stateSaved}
          No new changes!
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
            bind:value={selected[question._id]}
            min={0}
            step={1}
            max={options.length - 1}
            default={0}
            discrete
            displayMarkers />
          <span class="mdc-typography--headline4">
            {labelMap[stateMap[selected[question._id]]]}
          </span>
        </Content>
        <Actions fullBleed>
          <Button
            on:click={() => (selected[question._id] = prevSaved[question._id])}>
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
          No new changes!
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
</section>

<!-- TODO add snackbar for `saveState` -->
<!-- <Snackbar bind:this={stateSnackbar}>
  <Label>Your {params.name} progress has been successfully saved!</Label>
  <Actions>
    <IconButton class="material-icons" title="Dismiss">close</IconButton>
  </Actions>
</Snackbar> -->
