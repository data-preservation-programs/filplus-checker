## DataCap and CID Checker Report
 - Organization: `Some Company Inc`
 - Project: `My Project`
 - Client: `f12345`
### Storage Provider Distribution
| Provider  | Total Deals Made |              Location | Percentage |
| :-------- | ---------------: | --------------------: | ---------: |
| provider0 |         400.00 B |            ⚠️ Unknown |     40.00% |
| provider5 |         200.00 B |           Beijing, CN |     20.00% |
| provider1 |         100.00 B | San Francisco, CA, US |     10.00% |
| provider2 |         100.00 B | San Francisco, CA, US |     10.00% |
| provider3 |         100.00 B |      Portland, OR, US |     10.00% |
| provider4 |         100.00 B |      New York, NY, US |     10.00% |

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
