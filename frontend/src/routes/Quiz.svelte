<script>
  export let params = {};
  import { onMount, afterUpdate } from "svelte";
  import Card, { Content, Actions } from "@smui/card";
  import IconButton, { Icon } from "@smui/icon-button";
  import Chip from "@smui/chips";
  import Button, { Label } from "@smui/button";
  import Slider from "@smui/slider";

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

  onMount(() => {
    // TODO replace all with fetch of content from backend
    [
      {
        k: 1,
        name: "Broom",
        description: "A wooden handled broom.",
        price: 15
      },
      {
        k: 2,
        name: "Dust Pan",
        description: "A plastic dust pan.",
        price: 8
      },
      {
        k: 3,
        name: "Mop",
        description: "A strong, durable mop.",
        price: 18
      },
      {
        k: 4,
        name: "Bucket",
        description: "A metal bucket.",
        price: 13
      }
    ].forEach(question => questions.push(question));
    [
      {
        k: 1,
        label: "Unattempted"
      },
      {
        k: 2,
        label: "Very unlikely"
      },
      {
        k: 3,
        label: "Unlikely"
      },
      {
        k: 4,
        label: "Neutral"
      },
      {
        k: 5,
        label: "Likely"
      },
      {
        k: 6,
        label: "Very Likely"
      }
    ].forEach(option => options.push(option));
    // TODO: map to last logged in state
    questions.map(question => (selected[question.k] = 1));
    prevSelected = flattenState(selected);
    return async () => {
      let shouldSave = !stateSaved
        ? confirm(
            "You have unsaved answers. Do you want to save them before exiting?"
          )
        : false;
      if (shouldSave) await saveState();
    };
  });

  afterUpdate(() => {
    let currentSelected = flattenState(selected);
    if (JSON.stringify(prevSelected) == JSON.stringify(currentSelected))
      console.log("Same");
    else {
      console.log(`Current selected: ${JSON.stringify(currentSelected)}`);
      prevSelected = currentSelected;
      stateSaved = false;
    }
  });

  let saveState = () => {
    let currentSelected = flattenState(selected);
    if (JSON.stringify(prevSelected) != JSON.stringify(currentSelected)) {
      // TODO: update the audit log
      console.log(`Save state ${currentSelected}`);
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
    <Chip leading>{params.type}</Chip>
    {params.name}
    <IconButton
      class="material-icons"
      on:click={() => {
        for (var k in selected) selected[k] = 1;
      }}>
      rotate_right
    </IconButton>
  </h2>
</div>
{#each questions as question}
  <div class="container">
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
<div class="container" />