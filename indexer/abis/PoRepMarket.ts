// PoRep Market (fidlabs/porep-market) mainnet V1 ABI, from the verified deployed implementation
// 0x5A8934817B39391E9e02a07e333d3C3ac9251e0B behind proxy 0xBD669aBd1188F52e82aF114E17aCE2842DCc0Eb4.
// The repo ABI at fidlabs/porep-market@8a20c1a adds a manifestHash to DealProposalCreated that the
// deployed contract does not emit, so regenerate from the deployment, not the repo.
export const PoRepMarketAbi = [
  {
    "inputs": [],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  {
    "inputs": [],
    "name": "AccessControlBadConfirmation",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "account",
        "type": "address"
      },
      {
        "internalType": "bytes32",
        "name": "neededRole",
        "type": "bytes32"
      }
    ],
    "name": "AccessControlUnauthorizedAccount",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "target",
        "type": "address"
      }
    ],
    "name": "AddressEmptyCode",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "dealId",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "caller",
        "type": "address"
      }
    ],
    "name": "CallerIsNotValidator",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "padding",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "maxPadding",
        "type": "uint256"
      }
    ],
    "name": "DealCompletionPaddingTooHigh",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "DealDoesNotExist",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "dealId",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "currentBlock",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "expirationBlock",
        "type": "uint256"
      }
    ],
    "name": "DealNotExpiredYet",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "dealId",
        "type": "uint256"
      },
      {
        "internalType": "enum PoRepTypes.DealState",
        "name": "currentState",
        "type": "uint8"
      },
      {
        "internalType": "enum PoRepTypes.DealState",
        "name": "expectedState",
        "type": "uint8"
      }
    ],
    "name": "DealNotInExpectedState",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "dealId",
        "type": "uint256"
      }
    ],
    "name": "DealNotRejectable",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "implementation",
        "type": "address"
      }
    ],
    "name": "ERC1967InvalidImplementation",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "ERC1967NonPayable",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "EmptyManifestLocation",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "FailedCall",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidAllocationSizeForDealCompletion",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidClientSmartContractAddress",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidDealDuration",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "totalPerMonth",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "epochsInMonth",
        "type": "uint256"
      }
    ],
    "name": "InvalidDealPricePerSectorPerMonth",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidDealProposalExpiration",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidDealSize",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "uint8",
        "name": "value",
        "type": "uint8"
      }
    ],
    "name": "InvalidIndexingPct",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidInitialization",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidOrganizationAddress",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidRailId",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "uint16",
        "name": "value",
        "type": "uint16"
      }
    ],
    "name": "InvalidRetrievabilityBps",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "NoProviderFoundForDeal",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "NotInitializing",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "NotTheClientAddress",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "dealId",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "rejector",
        "type": "address"
      }
    ],
    "name": "NotTheClientOrStorageProviderOrAdmin",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "dealId",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "msgSender",
        "type": "address"
      },
      {
        "internalType": "CommonTypes.FilActorId",
        "name": "provider",
        "type": "uint64"
      }
    ],
    "name": "NotTheControllingAddress",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "dealId",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "validator",
        "type": "address"
      }
    ],
    "name": "NotTheDealValidator",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "dealId",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "validator",
        "type": "address"
      }
    ],
    "name": "NotTheRegisteredValidator",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "RailIdAlreadySet",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "TooLongManifestLocation",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "UUPSUnauthorizedCallContext",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "slot",
        "type": "bytes32"
      }
    ],
    "name": "UUPSUnsupportedProxiableUUID",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "dealId",
        "type": "uint256"
      }
    ],
    "name": "ValidatorAlreadySet",
    "type": "error"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "clientSmartContract",
        "type": "address"
      }
    ],
    "name": "ClientSmartContractUpdated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "dealId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "owner",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "CommonTypes.FilActorId",
        "name": "provider",
        "type": "uint64"
      }
    ],
    "name": "DealAccepted",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "dealId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "client",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "actualSizeBytes",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "CommonTypes.FilActorId",
        "name": "provider",
        "type": "uint64"
      }
    ],
    "name": "DealCompleted",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "oldPadding",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "newPadding",
        "type": "uint256"
      }
    ],
    "name": "DealCompletionPaddingUpdated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "dealId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "client",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "CommonTypes.FilActorId",
        "name": "provider",
        "type": "uint64"
      },
      {
        "components": [
          {
            "internalType": "uint16",
            "name": "retrievabilityBps",
            "type": "uint16"
          },
          {
            "internalType": "uint16",
            "name": "bandwidthMbps",
            "type": "uint16"
          },
          {
            "internalType": "uint16",
            "name": "latencyMs",
            "type": "uint16"
          },
          {
            "internalType": "uint8",
            "name": "indexingPct",
            "type": "uint8"
          }
        ],
        "indexed": false,
        "internalType": "struct SLITypes.SLIThresholds",
        "name": "requirements",
        "type": "tuple"
      },
      {
        "indexed": false,
        "internalType": "string",
        "name": "manifestLocation",
        "type": "string"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "totalDealSize",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "proposedAtBlock",
        "type": "uint256"
      }
    ],
    "name": "DealProposalCreated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "newDealProposalExpiration",
        "type": "uint256"
      }
    ],
    "name": "DealProposalExpirationUpdated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "dealId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "expiredAtBlock",
        "type": "uint256"
      }
    ],
    "name": "DealProposalExpired",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "dealId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "rejector",
        "type": "address"
      }
    ],
    "name": "DealRejected",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "dealId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "terminator",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "endEpoch",
        "type": "uint256"
      }
    ],
    "name": "DealTerminated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "uint64",
        "name": "version",
        "type": "uint64"
      }
    ],
    "name": "Initialized",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "dealId",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "string",
        "name": "oldManifestLocation",
        "type": "string"
      },
      {
        "indexed": false,
        "internalType": "string",
        "name": "newManifestLocation",
        "type": "string"
      }
    ],
    "name": "ManifestLocationUpdated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "dealId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "railId",
        "type": "uint256"
      }
    ],
    "name": "RailIdUpdated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "role",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "previousAdminRole",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "newAdminRole",
        "type": "bytes32"
      }
    ],
    "name": "RoleAdminChanged",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "role",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "account",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "sender",
        "type": "address"
      }
    ],
    "name": "RoleGranted",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "role",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "account",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "sender",
        "type": "address"
      }
    ],
    "name": "RoleRevoked",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "implementation",
        "type": "address"
      }
    ],
    "name": "Upgraded",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "dealId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "validator",
        "type": "address"
      }
    ],
    "name": "ValidatorUpdated",
    "type": "event"
  },
  {
    "inputs": [],
    "name": "DEFAULT_ADMIN_ROLE",
    "outputs": [
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "EPOCHS_IN_MONTH",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "MAX_DEAL_DURATION_DAYS",
    "outputs": [
      {
        "internalType": "uint32",
        "name": "",
        "type": "uint32"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "MIN_DEAL_DURATION_DAYS",
    "outputs": [
      {
        "internalType": "uint32",
        "name": "",
        "type": "uint32"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "SECTOR_SIZE",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "UPGRADER_ROLE",
    "outputs": [
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "UPGRADE_INTERFACE_VERSION",
    "outputs": [
      {
        "internalType": "string",
        "name": "",
        "type": "string"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "dealId",
        "type": "uint256"
      }
    ],
    "name": "acceptDeal",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "dealId",
        "type": "uint256"
      }
    ],
    "name": "completeDeal",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getClientSmartContract",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getCompletedDeals",
    "outputs": [
      {
        "components": [
          {
            "internalType": "uint256",
            "name": "dealId",
            "type": "uint256"
          },
          {
            "internalType": "address",
            "name": "client",
            "type": "address"
          },
          {
            "internalType": "CommonTypes.FilActorId",
            "name": "provider",
            "type": "uint64"
          },
          {
            "components": [
              {
                "internalType": "uint16",
                "name": "retrievabilityBps",
                "type": "uint16"
              },
              {
                "internalType": "uint16",
                "name": "bandwidthMbps",
                "type": "uint16"
              },
              {
                "internalType": "uint16",
                "name": "latencyMs",
                "type": "uint16"
              },
              {
                "internalType": "uint8",
                "name": "indexingPct",
                "type": "uint8"
              }
            ],
            "internalType": "struct SLITypes.SLIThresholds",
            "name": "requirements",
            "type": "tuple"
          },
          {
            "components": [
              {
                "internalType": "uint256",
                "name": "dealSizeBytes",
                "type": "uint256"
              },
              {
                "internalType": "uint256",
                "name": "pricePerSectorPerMonth",
                "type": "uint256"
              },
              {
                "internalType": "uint32",
                "name": "durationDays",
                "type": "uint32"
              }
            ],
            "internalType": "struct SLITypes.DealTerms",
            "name": "terms",
            "type": "tuple"
          },
          {
            "internalType": "address",
            "name": "validator",
            "type": "address"
          },
          {
            "internalType": "enum PoRepTypes.DealState",
            "name": "state",
            "type": "uint8"
          },
          {
            "internalType": "uint256",
            "name": "railId",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "proposedAtBlock",
            "type": "uint256"
          },
          {
            "internalType": "string",
            "name": "manifestLocation",
            "type": "string"
          }
        ],
        "internalType": "struct PoRepTypes.DealProposal[]",
        "name": "completedDeals",
        "type": "tuple[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getDealCompletionPadding",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "dealId",
        "type": "uint256"
      }
    ],
    "name": "getDealProposal",
    "outputs": [
      {
        "components": [
          {
            "internalType": "uint256",
            "name": "dealId",
            "type": "uint256"
          },
          {
            "internalType": "address",
            "name": "client",
            "type": "address"
          },
          {
            "internalType": "CommonTypes.FilActorId",
            "name": "provider",
            "type": "uint64"
          },
          {
            "components": [
              {
                "internalType": "uint16",
                "name": "retrievabilityBps",
                "type": "uint16"
              },
              {
                "internalType": "uint16",
                "name": "bandwidthMbps",
                "type": "uint16"
              },
              {
                "internalType": "uint16",
                "name": "latencyMs",
                "type": "uint16"
              },
              {
                "internalType": "uint8",
                "name": "indexingPct",
                "type": "uint8"
              }
            ],
            "internalType": "struct SLITypes.SLIThresholds",
            "name": "requirements",
            "type": "tuple"
          },
          {
            "components": [
              {
                "internalType": "uint256",
                "name": "dealSizeBytes",
                "type": "uint256"
              },
              {
                "internalType": "uint256",
                "name": "pricePerSectorPerMonth",
                "type": "uint256"
              },
              {
                "internalType": "uint32",
                "name": "durationDays",
                "type": "uint32"
              }
            ],
            "internalType": "struct SLITypes.DealTerms",
            "name": "terms",
            "type": "tuple"
          },
          {
            "internalType": "address",
            "name": "validator",
            "type": "address"
          },
          {
            "internalType": "enum PoRepTypes.DealState",
            "name": "state",
            "type": "uint8"
          },
          {
            "internalType": "uint256",
            "name": "railId",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "proposedAtBlock",
            "type": "uint256"
          },
          {
            "internalType": "string",
            "name": "manifestLocation",
            "type": "string"
          }
        ],
        "internalType": "struct PoRepTypes.DealProposal",
        "name": "",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getDealProposalExpiration",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getDeals",
    "outputs": [
      {
        "components": [
          {
            "internalType": "uint256",
            "name": "dealId",
            "type": "uint256"
          },
          {
            "internalType": "address",
            "name": "client",
            "type": "address"
          },
          {
            "internalType": "CommonTypes.FilActorId",
            "name": "provider",
            "type": "uint64"
          },
          {
            "components": [
              {
                "internalType": "uint16",
                "name": "retrievabilityBps",
                "type": "uint16"
              },
              {
                "internalType": "uint16",
                "name": "bandwidthMbps",
                "type": "uint16"
              },
              {
                "internalType": "uint16",
                "name": "latencyMs",
                "type": "uint16"
              },
              {
                "internalType": "uint8",
                "name": "indexingPct",
                "type": "uint8"
              }
            ],
            "internalType": "struct SLITypes.SLIThresholds",
            "name": "requirements",
            "type": "tuple"
          },
          {
            "components": [
              {
                "internalType": "uint256",
                "name": "dealSizeBytes",
                "type": "uint256"
              },
              {
                "internalType": "uint256",
                "name": "pricePerSectorPerMonth",
                "type": "uint256"
              },
              {
                "internalType": "uint32",
                "name": "durationDays",
                "type": "uint32"
              }
            ],
            "internalType": "struct SLITypes.DealTerms",
            "name": "terms",
            "type": "tuple"
          },
          {
            "internalType": "address",
            "name": "validator",
            "type": "address"
          },
          {
            "internalType": "enum PoRepTypes.DealState",
            "name": "state",
            "type": "uint8"
          },
          {
            "internalType": "uint256",
            "name": "railId",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "proposedAtBlock",
            "type": "uint256"
          },
          {
            "internalType": "string",
            "name": "manifestLocation",
            "type": "string"
          }
        ],
        "internalType": "struct PoRepTypes.DealProposal[]",
        "name": "deals",
        "type": "tuple[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "organization",
        "type": "address"
      },
      {
        "internalType": "enum PoRepTypes.DealState",
        "name": "state",
        "type": "uint8"
      }
    ],
    "name": "getDealsForOrganizationByState",
    "outputs": [
      {
        "components": [
          {
            "internalType": "uint256",
            "name": "dealId",
            "type": "uint256"
          },
          {
            "internalType": "address",
            "name": "client",
            "type": "address"
          },
          {
            "internalType": "CommonTypes.FilActorId",
            "name": "provider",
            "type": "uint64"
          },
          {
            "components": [
              {
                "internalType": "uint16",
                "name": "retrievabilityBps",
                "type": "uint16"
              },
              {
                "internalType": "uint16",
                "name": "bandwidthMbps",
                "type": "uint16"
              },
              {
                "internalType": "uint16",
                "name": "latencyMs",
                "type": "uint16"
              },
              {
                "internalType": "uint8",
                "name": "indexingPct",
                "type": "uint8"
              }
            ],
            "internalType": "struct SLITypes.SLIThresholds",
            "name": "requirements",
            "type": "tuple"
          },
          {
            "components": [
              {
                "internalType": "uint256",
                "name": "dealSizeBytes",
                "type": "uint256"
              },
              {
                "internalType": "uint256",
                "name": "pricePerSectorPerMonth",
                "type": "uint256"
              },
              {
                "internalType": "uint32",
                "name": "durationDays",
                "type": "uint32"
              }
            ],
            "internalType": "struct SLITypes.DealTerms",
            "name": "terms",
            "type": "tuple"
          },
          {
            "internalType": "address",
            "name": "validator",
            "type": "address"
          },
          {
            "internalType": "enum PoRepTypes.DealState",
            "name": "state",
            "type": "uint8"
          },
          {
            "internalType": "uint256",
            "name": "railId",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "proposedAtBlock",
            "type": "uint256"
          },
          {
            "internalType": "string",
            "name": "manifestLocation",
            "type": "string"
          }
        ],
        "internalType": "struct PoRepTypes.DealProposal[]",
        "name": "deals",
        "type": "tuple[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "dealId",
        "type": "uint256"
      }
    ],
    "name": "getManifestLocation",
    "outputs": [
      {
        "internalType": "string",
        "name": "manifestLocation",
        "type": "string"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "role",
        "type": "bytes32"
      }
    ],
    "name": "getRoleAdmin",
    "outputs": [
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getSPRegistryContract",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getValidatorFactoryContract",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "role",
        "type": "bytes32"
      },
      {
        "internalType": "address",
        "name": "account",
        "type": "address"
      }
    ],
    "name": "grantRole",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "role",
        "type": "bytes32"
      },
      {
        "internalType": "address",
        "name": "account",
        "type": "address"
      }
    ],
    "name": "hasRole",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "_admin",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "_validatorFactory",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "_spRegistry",
        "type": "address"
      }
    ],
    "name": "initialize",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "components": [
          {
            "internalType": "uint16",
            "name": "retrievabilityBps",
            "type": "uint16"
          },
          {
            "internalType": "uint16",
            "name": "bandwidthMbps",
            "type": "uint16"
          },
          {
            "internalType": "uint16",
            "name": "latencyMs",
            "type": "uint16"
          },
          {
            "internalType": "uint8",
            "name": "indexingPct",
            "type": "uint8"
          }
        ],
        "internalType": "struct SLITypes.SLIThresholds",
        "name": "requirements",
        "type": "tuple"
      },
      {
        "components": [
          {
            "internalType": "uint256",
            "name": "dealSizeBytes",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "pricePerSectorPerMonth",
            "type": "uint256"
          },
          {
            "internalType": "uint32",
            "name": "durationDays",
            "type": "uint32"
          }
        ],
        "internalType": "struct SLITypes.DealTerms",
        "name": "terms",
        "type": "tuple"
      },
      {
        "internalType": "string",
        "name": "manifestLocation",
        "type": "string"
      }
    ],
    "name": "proposeDeal",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "proxiableUUID",
    "outputs": [
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "dealId",
        "type": "uint256"
      }
    ],
    "name": "rejectAcceptedDeal",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "dealId",
        "type": "uint256"
      }
    ],
    "name": "rejectDeal",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "dealId",
        "type": "uint256"
      }
    ],
    "name": "rejectExpiredDeal",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "role",
        "type": "bytes32"
      },
      {
        "internalType": "address",
        "name": "callerConfirmation",
        "type": "address"
      }
    ],
    "name": "renounceRole",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "role",
        "type": "bytes32"
      },
      {
        "internalType": "address",
        "name": "account",
        "type": "address"
      }
    ],
    "name": "revokeRole",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "_clientSmartContract",
        "type": "address"
      }
    ],
    "name": "setClientSmartContract",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "padding",
        "type": "uint256"
      }
    ],
    "name": "setDealCompletionPadding",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "newDealProposalExpiration",
        "type": "uint256"
      }
    ],
    "name": "setNewDealProposalExpiration",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes4",
        "name": "interfaceId",
        "type": "bytes4"
      }
    ],
    "name": "supportsInterface",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "dealId",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "terminator",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "endEpoch",
        "type": "uint256"
      }
    ],
    "name": "terminateDeal",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "dealId",
        "type": "uint256"
      },
      {
        "internalType": "string",
        "name": "newManifestLocation",
        "type": "string"
      }
    ],
    "name": "updateManifestLocation",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "dealId",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "railId",
        "type": "uint256"
      }
    ],
    "name": "updateRailId",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "dealId",
        "type": "uint256"
      }
    ],
    "name": "updateValidator",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "newImplementation",
        "type": "address"
      },
      {
        "internalType": "bytes",
        "name": "data",
        "type": "bytes"
      }
    ],
    "name": "upgradeToAndCall",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  }
] as const
