<script>
  // Import the router component
  import Router from "svelte-spa-router";
  import A from "@smui/common/A.svelte";
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
  import {
    link,
    push,
    pop,
    replace,
    location,
    querystring
  } from "svelte-spa-router";
  import active from "svelte-spa-router/active";
  import routes from "./routes";
  import Button, { Label, Icon } from "@smui/button";
  let navDrawer; // navigation drawer object
  let title = "Homepage";
  let drawerOpen = false;
  let switchPage = url => {
    drawerOpen = !drawerOpen;
    push(url);
  };
</script>

<style>
  :global(a.active) {
    color: black;
  }
</style>

<svelte:head>
  <title>{title}</title>
</svelte:head>

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
      <Title component={A} on:click={() => replace('/')} class="">
        Social Network App
      </Title>
    </Section>
    <Section align="end" toolbar>
      <IconButton class="material-icons" on:click={() => replace('/api/login')}>
        fingerprint
      </IconButton>
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
          <em>(Optional)</em>
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
        on:SMUI:action={() => switchPage('/questions/inter/ssq12')}>
        <Graphic class="material-icons" aria-hidden="true">post_add</Graphic>
        <Text>
          SSQ-12
          <em>(Optional)</em>
        </Text>
      </Item>
    </List>
  </Content>
</Drawer>

<div class="container">
  <Router
    {routes}
    on:conditionsFailed={event => console.log(`Condition failed ${JSON.stringify(event.detail)}`)}
    on:routeLoaded={event => console.log(`Route loaded ${JSON.stringify(event.detail)}`)} />
</div>
