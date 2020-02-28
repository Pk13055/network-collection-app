<script>
  import { link } from "svelte-spa-router";
  import Paper, { Title, Subtitle, Content } from "@smui/paper";
  import { fade } from "svelte/transition";
</script>

<div class="card-container long" in:fade={{ duration: 500 }}>
  <Paper color={'secondary'} elevation={10}>
    <Title>Privacy</Title>
    <Content>
      <p>
        All data that is collected through the questionnaires is anonymized
        using a simple hashing technique over LDAP. When you log in to the
        platform using CAS, your sambaSID (a unique ID for each student) is
        hashed and logged into the database as your identity. This is now your
        reference for any activity on the site.
      </p>
      <Subtitle>Searching and Querying</Subtitle>
      <p>
        For the interpersonal questionnaire, you will be asked to fill out
        certain questions about the support structure around you. For this, to
        maintain anonymity, a search can be performed over the public LDAP
        (college-private “telephone” booth) for the relevant sambaSID of the
        other user and will, again be hashed and stored as the network
        connectivity from you to the other nodes.
      </p>
      <Subtitle>Analysis</Subtitle>
      <p>
        Once the target sample size has been reached, the hashed network from
        the database will be salted and subjected to further analysis. At this
        point, the entire network will be visualized on the site for public
        access and viewing. Further analysis of trends and topography would be
        made available as and when it has been performed.
      </p>
      <Subtitle>Raffle System</Subtitle>
      <p>
        When each user logs in to the system for the first time, he is presented
        with a prompt to choose a unique nickname (either his own or a randomly
        generated one). This nickname will be mapped to the hashed ID and used
        for later reference (by you) to collect your total
        <a href="/renumeration" use:link>remuneration</a>
        (including, potential Amazon gift voucher).
      </p>
    </Content>
  </Paper>
</div>
