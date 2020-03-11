<script>
  import Button, { Label } from "@smui/button";
  import { onMount } from "svelte";
  import Tab, { Icon } from "@smui/tab";
  import TabBar from "@smui/tab-bar";
  import { push } from "svelte-spa-router";
  import Paper, { Title, Subtitle, Content } from "@smui/paper";
  import Chip from "@smui/chips";
  import List, { Text, PrimaryText, SecondaryText, Item } from "@smui/list";
  import { fade } from "svelte/transition";
  let keyedTabs = [
      {
        k: 1,
        icon: "portrait",
        label: "Intrapersonal",
        type: "intra",
        n: 43,
        questions: [
          {
            name: "HUMS",
            id: "hums",
            disabled: false,
            optional: false,
            n: 13,
            caption: "Healthy Unhealthy Music Scale"
          },
          {
            name: "K-10",
            id: "k10",
            disabled: false,
            optional: false,
            n: 10,
            caption: "K10 correlation scores calculated using certain metrics."
          },
          {
            name: "20-IDIP",
            id: "idip20",
            disabled: false,
            optional: true,
            n: 20,
            caption: "International Personality Item Pool."
          }
        ],
        info: `Intrapersonal questionnaires are responsible for adding intrinsic value to
      each node. The questionnaires are quantized into various metrics
      (mentioned below) and used to assign a score vector to each node, an
      embedding, of sorts.`
      },
      {
        k: 2,
        icon: "transfer_within_a_station",
        label: "Interpersonal",
        type: "inter",
        n: 16,
        questions: [
          {
            name: "SSQ-6",
            id: "ssq6",
            disabled: false,
            optional: false,
            n: 6,
            caption: "The actual network analysis question"
          },
          {
            name: "MSPSS",
            id: "mspss",
            disabled: false,
            optional: true,
            n: 12,
            caption: "Multidimensional Scale of Perceived Social Support"
          }
        ],
        info: `The interpersonal questionnaire is responsible for modeling edges in a
      directed, weighted fashion. Think of it like node ABC having filled
      Question 3 choosing node PQR as option C (refer to the intrapersonal
      section for more information).`
      }
    ],
    selectedIdx = 0,
    keyedTabsActive,
    __type,
    quizzes,
    quiz;

  keyedTabsActive = keyedTabs[0];
  $: (__type = keyedTabsActive.type),
    (quizzes = keyedTabsActive.questions),
    (quiz = quizzes[selectedIdx]);
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
  <div class="card-container long" in:fade={{ duration: 600 }}>
    <Paper color={'default'} elevation={10}>
      <Title>{keyedTabsActive.label} Questionnaires</Title>
      <Content>
        {keyedTabsActive.info}
        <List
          color={'primary'}
          threeLine
          singleSelection
          bind:selectedIndex={selectedIdx}>
          {#each keyedTabsActive.questions as item}
            <Item
              on:SMUI:action={() => push(`/questions/${__type}/${item.id}`)}
              disabled={item.disabled}
              selected={quiz === item}>
              <Text>
                <PrimaryText>
                  {item.name}
                  {#if item.optional}
                    <Chip>
                      <Icon class="material-icons" leading>info</Icon>
                      Optional
                    </Chip>
                  {/if}
                </PrimaryText>
                <SecondaryText>
                  <em>
                    <strong>{item.n}</strong>
                    questions
                  </em>
                </SecondaryText>
                <SecondaryText>{item.caption}</SecondaryText>
              </Text>
            </Item>
          {/each}
        </List>
      </Content>
    </Paper>
  </div>
</div>
