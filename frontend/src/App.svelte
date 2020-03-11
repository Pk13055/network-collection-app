<script>
  // Import the router component
  import { user } from "./stores.js";
  import { setContext, getContext } from "svelte";
  import Router, {
    link,
    push,
    pop,
    replace,
    location,
    querystring
  } from "svelte-spa-router";
  import A from "@smui/common/A.svelte";
  import Chip, { Icon } from "@smui/chips";
  import TopAppBar, { Row, Section, Title } from "@smui/top-app-bar";
  import IconButton from "@smui/icon-button";
  import Drawer, {
    AppContent,
    Content,
    Header,
    Subtitle,
    Scrim
  } from "@smui/drawer";
  import List, { Item, Text, Graphic, Separator, Subheader } from "@smui/list";
  import H4 from "@smui/common/H4.svelte";
  import active from "svelte-spa-router/active";
  import routes from "./routes";
  import Button, { Label } from "@smui/button";
  import { parse } from "qs";

  export let title = "Introduction";
  $: document.title = title;

  let navDrawer; // navigation drawer object
  let drawerOpen = false;
  let switchPage = url => {
    drawerOpen = !drawerOpen;
    push(url);
  };
  let logged_in = false;

  let parsed = parse($querystring, { depth: 5 });
  if (parsed.user) {
    let __user = { ...parse(parsed.user), ...parse(parsed.data) };
    if (__user.success) {
      $user = parsed.user;
      logged_in = true;
    } else {
      alert(__user.message);
      logged_in = false;
    }
    replace("/");
  }
</script>

<style>
  :global(a.active) {
    color: black;
  }
</style>

<!-- Top bar for title -->
<TopAppBar variant="static" style="background-color: black;">
  <Row>
    <Section>
      <IconButton
        class="material-icons"
        on:click={() => (drawerOpen = !drawerOpen)}>
        apps
      </IconButton>
    </Section>
    <Section align="center">
      <Title component={A} on:click={() => push('/')}>Social Network App</Title>
    </Section>
    <Section align="end" toolbar>
      <Button
        href={!logged_in ? '/api/core/login' : 'https://login.iiit.ac.in/cas/logout'}>
        {!logged_in ? 'Login' : 'Logout'}
        <Icon class="material-icons" trailing>fingerprint</Icon>
      </Button>
    </Section>
  </Row>
</TopAppBar>

<!-- Side drawer for navigation -->
<Drawer variant="dismissible" bind:this={navDrawer} bind:open={drawerOpen}>
  <Content>
    <Header>
      <Title>Information</Title>
      <Subtitle>Research Overview</Subtitle>
    </Header>
    <List>
      <Item href="javascript:void(0)" on:SMUI:action={() => switchPage('/')}>
        <Graphic class="material-icons" aria-hidden="true">link</Graphic>
        <Text>Introduction</Text>
      </Item>
      <Item
        href="javascript:void(0)"
        on:SMUI:action={() => switchPage('/renumeration')}>
        <Graphic class="material-icons" aria-hidden="true">
          attach_money
        </Graphic>
        <Text>Renumeration</Text>
      </Item>
      <Item
        href="javascript:void(0)"
        on:SMUI:action={() => switchPage('/privacy')}>
        <Graphic class="material-icons" aria-hidden="true">star</Graphic>
        <Text>Data Privacy</Text>
      </Item>
    </List>
    <Separator nav />
    <Subheader component={H4}>Analysis (coming soon)</Subheader>
    <List>
      <Item
        href="javascript:void(0)"
        on:SMUI:action={() => switchPage('/analysis/nodal')}>
        <Graphic class="material-icons" aria-hidden="true">table_chart</Graphic>
        <Text>Nodal Analysis</Text>
      </Item>
      <Item
        href="javascript:void(0)"
        on:SMUI:action={() => switchPage('/analysis/network')}>
        <Graphic class="material-icons" aria-hidden="true">
          multiline_chart
        </Graphic>
        <Text>Network Visualization</Text>
      </Item>
    </List>
    <Header on:click={() => switchPage('/questions/')}>
      <Title>Questionnaires</Title>
      <Subtitle>General Questionnaire information</Subtitle>
    </Header>
    <Separator nav />
    <Subheader component={H4}>Intrapersonal</Subheader>
    <List>
      <Item
        href="javascript:void(0)"
        on:SMUI:action={() => switchPage('/questions/intra/k10')}>
        <Graphic class="material-icons" aria-hidden="true">ballot</Graphic>
        <Text>K-10</Text>
      </Item>
      <Item
        href="javascript:void(0)"
        on:SMUI:action={() => switchPage('/questions/intra/hums')}>
        <Graphic class="material-icons" aria-hidden="true">ballot</Graphic>
        <Text>HUMS</Text>
      </Item>
      <Item
        href="javascript:void(0)"
        on:SMUI:action={() => switchPage('/questions/intra/idip20')}>
        <Graphic class="material-icons" aria-hidden="true">post_add</Graphic>
        <Text>
          20-IDIP
          <Chip>
            <Icon class="material-icons" leading>info</Icon>
            Optional
          </Chip>
        </Text>
      </Item>
    </List>
    <Separator nav />
    <Subheader component={H4}>Interpersonal</Subheader>
    <List>
      <Item
        href="javascript:void(0)"
        on:SMUI:action={() => switchPage('/questions/inter/ssq6')}>
        <Graphic class="material-icons" aria-hidden="true">ballot</Graphic>
        <Text>SSQ-6</Text>
      </Item>
      <Item
        href="javascript:void(0)"
        on:SMUI:action={() => switchPage('/questions/inter/mspss')}>
        <Graphic class="material-icons" aria-hidden="true">post_add</Graphic>
        <Text>
          MSPSS
          <Chip>
            <Icon class="material-icons" leading>info</Icon>
            Optional
          </Chip>
        </Text>
      </Item>
    </List>
  </Content>
</Drawer>

<div class="container">
  <Router
    {routes}
    on:conditionsFailed={event => console.log(`Condition failed ${JSON.stringify(event.detail)}`)}
    on:routeLoaded={() => {}} />
</div>
