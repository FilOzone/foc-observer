// PoRep Market (fidlabs/porep-market) mainnet V1 ABI.
// Source: fidlabs/porep-market@8a20c1a (branch v1) abis/PoRepMarket.json
export const PoRepMarketAbi = [
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
    "name": "EPOCHS_IN_MONTH",
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
    "name": "MIN_DEAL_DURATION_DAYS",
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
    "name": "SECTOR_SIZE",
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
    "name": "acceptDeal",
    "inputs": [
      {
        "name": "dealId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "completeDeal",
    "inputs": [
      {
        "name": "dealId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "getClientSmartContract",
    "inputs": [],
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
    "name": "getCompletedDeals",
    "inputs": [],
    "outputs": [
      {
        "name": "completedDeals",
        "type": "tuple[]",
        "internalType": "struct PoRepTypes.DealProposal[]",
        "components": [
          {
            "name": "dealId",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "client",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "provider",
            "type": "uint64",
            "internalType": "CommonTypes.FilActorId"
          },
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
            "name": "validator",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "state",
            "type": "uint8",
            "internalType": "enum PoRepTypes.DealState"
          },
          {
            "name": "railId",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "proposedAtBlock",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "manifestLocation",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "manifestHash",
            "type": "bytes32",
            "internalType": "bytes32"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getDealCompletionPadding",
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
    "name": "getDealProposal",
    "inputs": [
      {
        "name": "dealId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct PoRepTypes.DealProposal",
        "components": [
          {
            "name": "dealId",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "client",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "provider",
            "type": "uint64",
            "internalType": "CommonTypes.FilActorId"
          },
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
            "name": "validator",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "state",
            "type": "uint8",
            "internalType": "enum PoRepTypes.DealState"
          },
          {
            "name": "railId",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "proposedAtBlock",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "manifestLocation",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "manifestHash",
            "type": "bytes32",
            "internalType": "bytes32"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getDealProposalExpiration",
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
    "name": "getDeals",
    "inputs": [],
    "outputs": [
      {
        "name": "deals",
        "type": "tuple[]",
        "internalType": "struct PoRepTypes.DealProposal[]",
        "components": [
          {
            "name": "dealId",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "client",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "provider",
            "type": "uint64",
            "internalType": "CommonTypes.FilActorId"
          },
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
            "name": "validator",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "state",
            "type": "uint8",
            "internalType": "enum PoRepTypes.DealState"
          },
          {
            "name": "railId",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "proposedAtBlock",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "manifestLocation",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "manifestHash",
            "type": "bytes32",
            "internalType": "bytes32"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getDealsForOrganizationByState",
    "inputs": [
      {
        "name": "organization",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "state",
        "type": "uint8",
        "internalType": "enum PoRepTypes.DealState"
      }
    ],
    "outputs": [
      {
        "name": "deals",
        "type": "tuple[]",
        "internalType": "struct PoRepTypes.DealProposal[]",
        "components": [
          {
            "name": "dealId",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "client",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "provider",
            "type": "uint64",
            "internalType": "CommonTypes.FilActorId"
          },
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
            "name": "validator",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "state",
            "type": "uint8",
            "internalType": "enum PoRepTypes.DealState"
          },
          {
            "name": "railId",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "proposedAtBlock",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "manifestLocation",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "manifestHash",
            "type": "bytes32",
            "internalType": "bytes32"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getManifestHash",
    "inputs": [
      {
        "name": "dealId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "manifestHash",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getManifestLocation",
    "inputs": [
      {
        "name": "dealId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "manifestLocation",
        "type": "string",
        "internalType": "string"
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
    "name": "getSPRegistryContract",
    "inputs": [],
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
    "name": "getValidatorFactoryContract",
    "inputs": [],
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
      },
      {
        "name": "_validatorFactory",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "_spRegistry",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "proposeDeal",
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
        "name": "manifestInfo",
        "type": "tuple",
        "internalType": "struct PoRepTypes.ManifestStruct",
        "components": [
          {
            "name": "location",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "hash",
            "type": "bytes32",
            "internalType": "bytes32"
          }
        ]
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
    "name": "rejectAcceptedDeal",
    "inputs": [
      {
        "name": "dealId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "rejectDeal",
    "inputs": [
      {
        "name": "dealId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "rejectExpiredDeal",
    "inputs": [
      {
        "name": "dealId",
        "type": "uint256",
        "internalType": "uint256"
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
    "name": "setClientSmartContract",
    "inputs": [
      {
        "name": "_clientSmartContract",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setDealCompletionPadding",
    "inputs": [
      {
        "name": "padding",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setNewDealProposalExpiration",
    "inputs": [
      {
        "name": "newDealProposalExpiration",
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
    "name": "terminateDeal",
    "inputs": [
      {
        "name": "dealId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "terminator",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "endEpoch",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "updateManifestLocation",
    "inputs": [
      {
        "name": "dealId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "newManifestLocation",
        "type": "string",
        "internalType": "string"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "updateRailId",
    "inputs": [
      {
        "name": "dealId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "railId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "updateValidator",
    "inputs": [
      {
        "name": "dealId",
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
    "name": "ClientSmartContractUpdated",
    "inputs": [
      {
        "name": "clientSmartContract",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "DealAccepted",
    "inputs": [
      {
        "name": "dealId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "owner",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
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
    "name": "DealCompleted",
    "inputs": [
      {
        "name": "dealId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "client",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "actualSizeBytes",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
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
    "name": "DealCompletionPaddingUpdated",
    "inputs": [
      {
        "name": "oldPadding",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "newPadding",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "DealProposalCreated",
    "inputs": [
      {
        "name": "dealId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "client",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "provider",
        "type": "uint64",
        "indexed": true,
        "internalType": "CommonTypes.FilActorId"
      },
      {
        "name": "requirements",
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
      },
      {
        "name": "manifestLocation",
        "type": "string",
        "indexed": false,
        "internalType": "string"
      },
      {
        "name": "manifestHash",
        "type": "bytes32",
        "indexed": false,
        "internalType": "bytes32"
      },
      {
        "name": "totalDealSize",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "proposedAtBlock",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "DealProposalExpirationUpdated",
    "inputs": [
      {
        "name": "newDealProposalExpiration",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "DealProposalExpired",
    "inputs": [
      {
        "name": "dealId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "expiredAtBlock",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "DealRejected",
    "inputs": [
      {
        "name": "dealId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "rejector",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "DealTerminated",
    "inputs": [
      {
        "name": "dealId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "terminator",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "endEpoch",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
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
    "name": "ManifestLocationUpdated",
    "inputs": [
      {
        "name": "dealId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "oldManifestLocation",
        "type": "string",
        "indexed": false,
        "internalType": "string"
      },
      {
        "name": "newManifestLocation",
        "type": "string",
        "indexed": false,
        "internalType": "string"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "RailIdUpdated",
    "inputs": [
      {
        "name": "dealId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "railId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
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
    "type": "event",
    "name": "ValidatorUpdated",
    "inputs": [
      {
        "name": "dealId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "validator",
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
    "name": "CallerIsNotValidator",
    "inputs": [
      {
        "name": "dealId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "caller",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "DealCompletionPaddingTooHigh",
    "inputs": [
      {
        "name": "padding",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "maxPadding",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "DealDoesNotExist",
    "inputs": []
  },
  {
    "type": "error",
    "name": "DealNotExpiredYet",
    "inputs": [
      {
        "name": "dealId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "currentBlock",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "expirationBlock",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "DealNotInExpectedState",
    "inputs": [
      {
        "name": "dealId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "currentState",
        "type": "uint8",
        "internalType": "enum PoRepTypes.DealState"
      },
      {
        "name": "expectedState",
        "type": "uint8",
        "internalType": "enum PoRepTypes.DealState"
      }
    ]
  },
  {
    "type": "error",
    "name": "DealNotRejectable",
    "inputs": [
      {
        "name": "dealId",
        "type": "uint256",
        "internalType": "uint256"
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
    "name": "EmptyManifestHash",
    "inputs": []
  },
  {
    "type": "error",
    "name": "EmptyManifestLocation",
    "inputs": []
  },
  {
    "type": "error",
    "name": "FailedCall",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidAllocationSizeForDealCompletion",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidClientSmartContractAddress",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidDealDuration",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidDealPricePerSectorPerMonth",
    "inputs": [
      {
        "name": "totalPerMonth",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "epochsInMonth",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "InvalidDealProposalExpiration",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidDealSize",
    "inputs": []
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
    "name": "InvalidRailId",
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
    "name": "NoProviderFoundForDeal",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotInitializing",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotTheClientAddress",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotTheClientOrStorageProviderOrAdmin",
    "inputs": [
      {
        "name": "dealId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "rejector",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "NotTheControllingAddress",
    "inputs": [
      {
        "name": "dealId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "msgSender",
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
    "name": "NotTheDealValidator",
    "inputs": [
      {
        "name": "dealId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "validator",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "NotTheRegisteredValidator",
    "inputs": [
      {
        "name": "dealId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "validator",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "RailIdAlreadySet",
    "inputs": []
  },
  {
    "type": "error",
    "name": "TooLongManifestLocation",
    "inputs": []
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
  },
  {
    "type": "error",
    "name": "ValidatorAlreadySet",
    "inputs": [
      {
        "name": "dealId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "ValidatorNotSet",
    "inputs": []
  }
] as const
