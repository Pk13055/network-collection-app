from cas import CASClient


class CAS:
    client: CASClient = CASClient(
        version=3,
        service_url="0.0.0.0:8000/api/core/login?next=%2F",
        server_url="https://login.iiit.ac.in/cas/"
    )


cas_client = CAS()


async def get_cas() -> CAS:
    return cas_client.client
