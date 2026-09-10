// PoRep Market (fidlabs/porep-market) mainnet V1 ABI.
// Source: fidlabs/porep-market@8a20c1a (branch v1) abis/SPRegistry.json
export const PoRepSPRegistryAbi = [
  {
    "type": "constructor",
    "inputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "DEFAULT_ADMIN_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "MARKET_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "MAX_DEAL_DURATION_DAYS",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint32",
        "internalType": "uint32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "MAX_PROVIDERS",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "MAX_TOLERANCE_BPS",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "OPERATOR_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "UPGRADER_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "UPGRADE_INTERFACE_VERSION",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "string",
        "internalType": "string"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "blockProvider",
    "inputs": [
      {
        "name": "provider",
        "type": "uint64",
        "internalType": "CommonTypes.FilActorId"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "commitCapacity",
    "inputs": [
      {
        "name": "provider",
        "type": "uint64",
        "internalType": "CommonTypes.FilActorId"
      },
      {
        "name": "estimatedSizeBytes",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "actualSizeBytes",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "getCommittedProviders",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint64[]",
        "internalType": "CommonTypes.FilActorId[]"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getPayee",
    "inputs": [
      {
        "name": "provider",
        "type": "uint64",
        "internalType": "CommonTypes.FilActorId"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getProviderForDeal",
    "inputs": [
      {
        "name": "requirements",
        "type": "tuple",
        "internalType": "struct SLITypes.SLIThresholds",
        "components": [
          {
            "name": "retrievabilityBps",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "bandwidthMbps",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "latencyMs",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "indexingPct",
            "type": "uint8",
            "internalType": "uint8"
          }
        ]
      },
      {
        "name": "terms",
        "type": "tuple",
        "internalType": "struct SLITypes.DealTerms",
        "components": [
          {
            "name": "dealSizeBytes",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "pricePerSectorPerMonth",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "durationDays",
            "type": "uint32",
            "internalType": "uint32"
          }
        ]
      },
      {
        "name": "manifestHash",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint64",
        "internalType": "CommonTypes.FilActorId"
      },
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      },
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "getProviderInfo",
    "inputs": [
      {
        "name": "provider",
        "type": "uint64",
        "internalType": "CommonTypes.FilActorId"
      }
    ],
    "outputs": [
      {
        "name": "info",
        "type": "tuple",
        "internalType": "struct ISPRegistry.ProviderInfo",
        "components": [
          {
            "name": "organization",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "payee",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "paused",
            "type": "bool",
            "internalType": "bool"
          },
          {
            "name": "blocked",
            "type": "bool",
            "internalType": "bool"
          },
          {
            "name": "capabilities",
            "type": "tuple",
            "internalType": "struct SLITypes.SLIThresholds",
            "components": [
              {
                "name": "retrievabilityBps",
                "type": "uint16",
                "internalType": "uint16"
              },
              {
                "name": "bandwidthMbps",
                "type": "uint16",
                "internalType": "uint16"
              },
              {
                "name": "latencyMs",
                "type": "uint16",
                "internalType": "uint16"
              },
              {
                "name": "indexingPct",
                "type": "uint8",
                "internalType": "uint8"
              }
            ]
          },
          {
            "name": "availableBytes",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "committedBytes",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "pendingBytes",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "pricePerSectorPerMonth",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "minDealDurationDays",
            "type": "uint32",
            "internalType": "uint32"
          },
          {
            "name": "maxDealDurationDays",
            "type": "uint32",
            "internalType": "uint32"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getProviders",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint64[]",
        "internalType": "CommonTypes.FilActorId[]"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getProvidersByOrganization",
    "inputs": [
      {
        "name": "organization",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint64[]",
        "internalType": "CommonTypes.FilActorId[]"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getRoleAdmin",
    "inputs": [
      {
        "name": "role",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getToleranceBps",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "grantRole",
    "inputs": [
      {
        "name": "role",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "hasRole",
    "inputs": [
      {
        "name": "role",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "initialize",
    "inputs": [
      {
        "name": "_admin",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "initialize2",
    "inputs": [
      {
        "name": "_poRepMarket",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "isAuthorizedForProvider",
    "inputs": [
      {
        "name": "caller",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "provider",
        "type": "uint64",
        "internalType": "CommonTypes.FilActorId"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "isProviderRegistered",
    "inputs": [
      {
        "name": "provider",
        "type": "uint64",
        "internalType": "CommonTypes.FilActorId"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "pauseProvider",
    "inputs": [
      {
        "name": "provider",
        "type": "uint64",
        "internalType": "CommonTypes.FilActorId"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "proxiableUUID",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "registerProviderFor",
    "inputs": [
      {
        "name": "provider",
        "type": "uint64",
        "internalType": "CommonTypes.FilActorId"
      },
      {
        "name": "organization",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "capabilities",
        "type": "tuple",
        "internalType": "struct SLITypes.SLIThresholds",
        "components": [
          {
            "name": "retrievabilityBps",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "bandwidthMbps",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "latencyMs",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "indexingPct",
            "type": "uint8",
            "internalType": "uint8"
          }
        ]
      },
      {
        "name": "availableBytes",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "pricePerSectorPerMonth",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "payee",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "minDealDurationDays",
        "type": "uint32",
        "internalType": "uint32"
      },
      {
        "name": "maxDealDurationDays",
        "type": "uint32",
        "internalType": "uint32"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "releaseCapacity",
    "inputs": [
      {
        "name": "provider",
        "type": "uint64",
        "internalType": "CommonTypes.FilActorId"
      },
      {
        "name": "sizeBytes",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "manifestHash",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "releasePendingCapacity",
    "inputs": [
      {
        "name": "provider",
        "type": "uint64",
        "internalType": "CommonTypes.FilActorId"
      },
      {
        "name": "sizeBytes",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "manifestHash",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "renounceRole",
    "inputs": [
      {
        "name": "role",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "callerConfirmation",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "revokeRole",
    "inputs": [
      {
        "name": "role",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setCapabilities",
    "inputs": [
      {
        "name": "provider",
        "type": "uint64",
        "internalType": "CommonTypes.FilActorId"
      },
      {
        "name": "capabilities",
        "type": "tuple",
        "internalType": "struct SLITypes.SLIThresholds",
        "components": [
          {
            "name": "retrievabilityBps",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "bandwidthMbps",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "latencyMs",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "indexingPct",
            "type": "uint8",
            "internalType": "uint8"
          }
        ]
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setDealDurationLimits",
    "inputs": [
      {
        "name": "provider",
        "type": "uint64",
        "internalType": "CommonTypes.FilActorId"
      },
      {
        "name": "minDealDurationDays",
        "type": "uint32",
        "internalType": "uint32"
      },
      {
        "name": "maxDealDurationDays",
        "type": "uint32",
        "internalType": "uint32"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setPayee",
    "inputs": [
      {
        "name": "provider",
        "type": "uint64",
        "internalType": "CommonTypes.FilActorId"
      },
      {
        "name": "payee",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setPrice",
    "inputs": [
      {
        "name": "provider",
        "type": "uint64",
        "internalType": "CommonTypes.FilActorId"
      },
      {
        "name": "pricePerSectorPerMonth",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setToleranceBps",
    "inputs": [
      {
        "name": "bps",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "supportsInterface",
    "inputs": [
      {
        "name": "interfaceId",
        "type": "bytes4",
        "internalType": "bytes4"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "unblockProvider",
    "inputs": [
      {
        "name": "provider",
        "type": "uint64",
        "internalType": "CommonTypes.FilActorId"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "unpauseProvider",
    "inputs": [
      {
        "name": "provider",
        "type": "uint64",
        "internalType": "CommonTypes.FilActorId"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "updateAvailableSpace",
    "inputs": [
      {
        "name": "provider",
        "type": "uint64",
        "internalType": "CommonTypes.FilActorId"
      },
      {
        "name": "availableBytes",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "upgradeToAndCall",
    "inputs": [
      {
        "name": "newImplementation",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "data",
        "type": "bytes",
        "internalType": "bytes"
      }
    ],
    "outputs": [],
    "stateMutability": "payable"
  },
  {
    "type": "event",
    "name": "AvailableSpaceUpdated",
    "inputs": [
      {
        "name": "provider",
        "type": "uint64",
        "indexed": true,
        "internalType": "CommonTypes.FilActorId"
      },
      {
        "name": "availableBytes",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "CapabilitiesUpdated",
    "inputs": [
      {
        "name": "provider",
        "type": "uint64",
        "indexed": true,
        "internalType": "CommonTypes.FilActorId"
      },
      {
        "name": "capabilities",
        "type": "tuple",
        "indexed": false,
        "internalType": "struct SLITypes.SLIThresholds",
        "components": [
          {
            "name": "retrievabilityBps",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "bandwidthMbps",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "latencyMs",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "indexingPct",
            "type": "uint8",
            "internalType": "uint8"
          }
        ]
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "CapacityCommitted",
    "inputs": [
      {
        "name": "provider",
        "type": "uint64",
        "indexed": true,
        "internalType": "CommonTypes.FilActorId"
      },
      {
        "name": "committedBytes",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "CapacityReleased",
    "inputs": [
      {
        "name": "provider",
        "type": "uint64",
        "indexed": true,
        "internalType": "CommonTypes.FilActorId"
      },
      {
        "name": "releasedBytes",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "DealDurationLimitsUpdated",
    "inputs": [
      {
        "name": "provider",
        "type": "uint64",
        "indexed": true,
        "internalType": "CommonTypes.FilActorId"
      },
      {
        "name": "minDealDurationDays",
        "type": "uint32",
        "indexed": false,
        "internalType": "uint32"
      },
      {
        "name": "maxDealDurationDays",
        "type": "uint32",
        "indexed": false,
        "internalType": "uint32"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Initialized",
    "inputs": [
      {
        "name": "version",
        "type": "uint64",
        "indexed": false,
        "internalType": "uint64"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "OrganizationAdded",
    "inputs": [
      {
        "name": "organization",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "PayeeUpdated",
    "inputs": [
      {
        "name": "provider",
        "type": "uint64",
        "indexed": true,
        "internalType": "CommonTypes.FilActorId"
      },
      {
        "name": "oldPayee",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "newPayee",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "PendingCapacityReleased",
    "inputs": [
      {
        "name": "provider",
        "type": "uint64",
        "indexed": true,
        "internalType": "CommonTypes.FilActorId"
      },
      {
        "name": "sizeBytes",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "PendingCapacityReserved",
    "inputs": [
      {
        "name": "provider",
        "type": "uint64",
        "indexed": true,
        "internalType": "CommonTypes.FilActorId"
      },
      {
        "name": "sizeBytes",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "PriceUpdated",
    "inputs": [
      {
        "name": "provider",
        "type": "uint64",
        "indexed": true,
        "internalType": "CommonTypes.FilActorId"
      },
      {
        "name": "oldPrice",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "newPrice",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ProviderBlocked",
    "inputs": [
      {
        "name": "provider",
        "type": "uint64",
        "indexed": true,
        "internalType": "CommonTypes.FilActorId"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ProviderPaused",
    "inputs": [
      {
        "name": "provider",
        "type": "uint64",
        "indexed": true,
        "internalType": "CommonTypes.FilActorId"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ProviderRegistered",
    "inputs": [
      {
        "name": "provider",
        "type": "uint64",
        "indexed": true,
        "internalType": "CommonTypes.FilActorId"
      },
      {
        "name": "organization",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ProviderUnblocked",
    "inputs": [
      {
        "name": "provider",
        "type": "uint64",
        "indexed": true,
        "internalType": "CommonTypes.FilActorId"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ProviderUnpaused",
    "inputs": [
      {
        "name": "provider",
        "type": "uint64",
        "indexed": true,
        "internalType": "CommonTypes.FilActorId"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "RoleAdminChanged",
    "inputs": [
      {
        "name": "role",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "previousAdminRole",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "newAdminRole",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "RoleGranted",
    "inputs": [
      {
        "name": "role",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "account",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "sender",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "RoleRevoked",
    "inputs": [
      {
        "name": "role",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "account",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "sender",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ToleranceBpsUpdated",
    "inputs": [
      {
        "name": "oldBps",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "newBps",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Upgraded",
    "inputs": [
      {
        "name": "implementation",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "error",
    "name": "AccessControlBadConfirmation",
    "inputs": []
  },
  {
    "type": "error",
    "name": "AccessControlUnauthorizedAccount",
    "inputs": [
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "neededRole",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ]
  },
  {
    "type": "error",
    "name": "ActorNotFound",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ActualSizeExceedsTolerance",
    "inputs": [
      {
        "name": "provider",
        "type": "uint64",
        "internalType": "CommonTypes.FilActorId"
      },
      {
        "name": "actualSize",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "maxAllowed",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "AddressEmptyCode",
    "inputs": [
      {
        "name": "target",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "AvailableBelowCommittedPlusPending",
    "inputs": [
      {
        "name": "provider",
        "type": "uint64",
        "internalType": "CommonTypes.FilActorId"
      },
      {
        "name": "availableBytes",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "committedBytes",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "pendingBytes",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "CommitExceedsAvailable",
    "inputs": [
      {
        "name": "provider",
        "type": "uint64",
        "internalType": "CommonTypes.FilActorId"
      },
      {
        "name": "newCommitted",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "availableBytes",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "DurationExceedsProtocolMax",
    "inputs": [
      {
        "name": "durationDays",
        "type": "uint32",
        "internalType": "uint32"
      },
      {
        "name": "maxDays",
        "type": "uint32",
        "internalType": "uint32"
      }
    ]
  },
  {
    "type": "error",
    "name": "ERC1967InvalidImplementation",
    "inputs": [
      {
        "name": "implementation",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "ERC1967NonPayable",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ExitCodeError",
    "inputs": []
  },
  {
    "type": "error",
    "name": "FailToCallActor",
    "inputs": []
  },
  {
    "type": "error",
    "name": "FailedCall",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidActorID",
    "inputs": [
      {
        "name": "actorId",
        "type": "uint64",
        "internalType": "CommonTypes.FilActorId"
      }
    ]
  },
  {
    "type": "error",
    "name": "InvalidAdminAddress",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidCodec",
    "inputs": [
      {
        "name": "",
        "type": "uint64",
        "internalType": "uint64"
      }
    ]
  },
  {
    "type": "error",
    "name": "InvalidIndexingPct",
    "inputs": [
      {
        "name": "value",
        "type": "uint8",
        "internalType": "uint8"
      }
    ]
  },
  {
    "type": "error",
    "name": "InvalidInitialization",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidOrganizationAddress",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidPayeeAddress",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidPoRepMarketAddress",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidProviderActorId",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidResponseLength",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidRetrievabilityBps",
    "inputs": [
      {
        "name": "value",
        "type": "uint16",
        "internalType": "uint16"
      }
    ]
  },
  {
    "type": "error",
    "name": "MaxProvidersReached",
    "inputs": [
      {
        "name": "maxProviders",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "MinDurationExceedsMax",
    "inputs": [
      {
        "name": "minDays",
        "type": "uint32",
        "internalType": "uint32"
      },
      {
        "name": "maxDays",
        "type": "uint32",
        "internalType": "uint32"
      }
    ]
  },
  {
    "type": "error",
    "name": "NotAdminOrOperator",
    "inputs": [
      {
        "name": "caller",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "NotEnoughBalance",
    "inputs": [
      {
        "name": "balance",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "value",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "NotInitializing",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotProviderControllerOrAdmin",
    "inputs": [
      {
        "name": "caller",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "provider",
        "type": "uint64",
        "internalType": "CommonTypes.FilActorId"
      }
    ]
  },
  {
    "type": "error",
    "name": "ProviderAlreadyRegistered",
    "inputs": [
      {
        "name": "provider",
        "type": "uint64",
        "internalType": "CommonTypes.FilActorId"
      }
    ]
  },
  {
    "type": "error",
    "name": "ProviderIsBlocked",
    "inputs": [
      {
        "name": "provider",
        "type": "uint64",
        "internalType": "CommonTypes.FilActorId"
      }
    ]
  },
  {
    "type": "error",
    "name": "ProviderNotRegistered",
    "inputs": [
      {
        "name": "provider",
        "type": "uint64",
        "internalType": "CommonTypes.FilActorId"
      }
    ]
  },
  {
    "type": "error",
    "name": "ReleaseExceedsCommitted",
    "inputs": [
      {
        "name": "provider",
        "type": "uint64",
        "internalType": "CommonTypes.FilActorId"
      },
      {
        "name": "sizeBytes",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "committedBytes",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "ReleasePendingExceedsPending",
    "inputs": [
      {
        "name": "provider",
        "type": "uint64",
        "internalType": "CommonTypes.FilActorId"
      },
      {
        "name": "sizeBytes",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "pendingBytes",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "ToleranceBpsTooHigh",
    "inputs": [
      {
        "name": "bps",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "maxBps",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "UUPSUnauthorizedCallContext",
    "inputs": []
  },
  {
    "type": "error",
    "name": "UUPSUnsupportedProxiableUUID",
    "inputs": [
      {
        "name": "slot",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ]
  }
] as const
