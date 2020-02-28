<script>
  import Intra from "./Intra.svelte";
  import Inter from "./Inter.svelte";
  import Button, { Label } from "@smui/button";
  import Tab, { Icon } from "@smui/tab";
  import TabBar from "@smui/tab-bar";
  let keyedTabs = [
      {
        k: 1,
        icon: "portrait",
        label: "Intrapersonal",
        component: Intra
      },
      {
        k: 2,
        icon: "transfer_within_a_station",
        label: "Interpersonal",
        component: Inter
      }
    ],
    keyedTabsActive = keyedTabs[0];
</script>

<div class="container">
  <h2>Questionnaires</h2>
  <p>
    The questionnaires are mainly of two types, viz.
    <Button on:click={() => (keyedTabsActive = keyedTabs[0])}>
      <Label>intrapersonal</Label>
    </Button>
    or
    <Button on:click={() => (keyedTabsActive = keyedTabs[1])}>
      <Label>interpersonal</Label>
    </Button>
  </p>
  <TabBar
    tabs={keyedTabs}
    let:tab
    key={tab => tab.k}
    bind:active={keyedTabsActive}>
    <Tab
      {tab}
      stacked={true}
      indicatorSpanOnlyContent={true}
      tabIndicator$transition="fade">
      <Icon class="material-icons">{tab.icon}</Icon>
      <Label>{tab.label}</Label>
    </Tab>
  </TabBar>
  <div class="container">
    <svelte:component this={keyedTabsActive.component} />
  </div>
</div>
