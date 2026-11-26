---
status: proposed
date: 2026-11-26
decision-makers: Lucas Poulain
---

# 0004 An instance runs as one process

## Context and problem

How many processes serve one instance? The collaborative rooms of Hocuspocus keep their open documents in the memory of the process, as do the rate limiter of passwords and tokens, the editors of a deck since its last snapshot and the deck tickets already redeemed.

## Considered options

- Several replicas behind the router, with these four pieces of state moved to a shared store, such as the Redis extension of Hocuspocus. Set aside in July 2026, when we designed the collaborative editing, as outside its goals, without a written reason.

## Decision

An instance runs as one process, one web container on Scalingo (`sc scale web:1`). Before we run several replicas, we write a new decision that moves the four pieces of state to a shared store.

## Consequences

- Two editors of a deck always reach the same document, and the rate limits count every attempt.
- The process bounds the throughput of the instance. On Scalingo, the router keeps a queue of 50 requests per web container and answers 503 to a request that arrives while it is full ([routing](https://doc.scalingo.com/platform/networking/public/routing)).
- During a deployment two containers run together for a short time, which the migrations handle with an advisory lock (see [0002](0002-storage-behind-ports.md)).

## Confirmation

- No automatic check counts the processes of an instance. The guide of each platform gives the command that sets one ([deploy-scalingo.md](../deploy-scalingo.md)), and [architecture.md](../architecture.md) lists the state kept in memory, which the reviewer checks when a change adds to it.

## Open questions

- Why do we set aside several replicas with a shared store: the traffic of an instance, the cost of one more service per platform, or the simplicity of running one process?
