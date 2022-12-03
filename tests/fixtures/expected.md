## DataCap and CID Checker Report
 - Organization: `Some Company Inc`
 - Project: `My Project`
 - Client: `f12345`
### Storage Provider Distribution
We are looking for below common criteria for deal distribution among storage providers.
If you are not meeting those criteria, please explain why.
 - Storage provider should not exceed 25% of total deal size.
 - Storage provider should not be storing same data more than 25%.
 - Storage provider should have published its public IP address.
 - The storage providers should be located in different regions.
 - The GeoIP location is resolved using Maxmind GeoIP database.

⚠️ [provider0](https://filfox.info/en/address/provider0) has sealed more than 25% of total deals.

⚠️ [provider0](https://filfox.info/en/address/provider0) has sealed same data more than 25%.

⚠️ [provider0](https://filfox.info/en/address/provider0) has unknown IP location.

⚠️ [provider5](https://filfox.info/en/address/provider5) has sealed same data more than 25%.

| Provider                                              |              Location | Total Deals Made | Percentage | Unique Data | Duplication Factor |
| :---------------------------------------------------- | --------------------: | ---------------: | ---------: | ----------: | -----------------: |
| [provider0](https://filfox.info/en/address/provider0) |               Unknown |         400.00 B |     40.00% |    100.00 B |               4.00 |
| [provider5](https://filfox.info/en/address/provider5) |           Beijing, CN |         200.00 B |     20.00% |    100.00 B |               2.00 |
| [provider1](https://filfox.info/en/address/provider1) | San Francisco, CA, US |         100.00 B |     10.00% |    100.00 B |               1.00 |
| [provider2](https://filfox.info/en/address/provider2) | San Francisco, CA, US |         100.00 B |     10.00% |    100.00 B |               1.00 |
| [provider3](https://filfox.info/en/address/provider3) |      Portland, OR, US |         100.00 B |     10.00% |    100.00 B |               1.00 |
| [provider4](https://filfox.info/en/address/provider4) |      New York, NY, US |         100.00 B |     10.00% |    100.00 B |               1.00 |

![Provider Distribution](./provider.png)
### Deal Data Replication
| Number of Replicas | Total Deals Made | Percentage |
| -----------------: | ---------------: | ---------: |
|                  1 |         100.00 B |     10.00% |
|                  2 |         200.00 B |     20.00% |
|                  3 |         300.00 B |     30.00% |
|                  4 |         400.00 B |     40.00% |

![Replication Distribution](./replica.png)
### Deal Data Shared with other Clients
| Other Client | Total Deals Made | Unique CIDs |
| -----------: | ---------------: | ----------: |
|       fxxxx3 |         200.00 B |           2 |
|       fxxxx2 |         100.00 B |           1 |
