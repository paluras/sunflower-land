import {
  createMachine,
  Interpreter,
  assign,
  TransitionsConfig,
  State,
} from "xstate";
import {
  PLAYING_EVENTS,
  PlacementEvent,
  PLACEMENT_EVENTS,
  GameEvent,
  PlayingEvent,
  GameEventName,
} from "../events";

import { Context as AuthContext } from "features/auth/lib/authMachine";
import { metamask } from "../../../lib/blockchain/metamask";

import { GameState, InventoryItemName } from "../types/game";
import { loadSession, MintedAt } from "../actions/loadSession";
import { EMPTY } from "./constants";
import { autosave } from "../actions/autosave";
import { CollectibleName, LimitedItemName } from "../types/craftables";
import { sync } from "../actions/sync";
import { getOnChainState } from "../actions/onchain";
import { ErrorCode, ERRORS } from "lib/errors";
import { updateGame } from "./transforms";
import { getFingerPrint } from "./botDetection";
import { SkillName } from "../types/skills";
import { levelUp } from "../actions/levelUp";
import { reset } from "features/farming/hud/actions/reset";
import {
  getGameRulesLastRead,
  hasAnnouncements,
} from "features/announcements/announcementsStorage";
import { OnChainEvent, unseenEvents } from "../actions/onChainEvents";
import { expand } from "../expansion/actions/expand";
import { checkProgress, processEvent } from "./processEvent";
import { editingMachine } from "../expansion/placeable/editingMachine";
import { BuildingName } from "../types/buildings";
import { Context } from "../GameProvider";
import { isSwarming } from "../events/detectBot";
import { generateTestLand } from "../expansion/actions/generateLand";
import {
  canMigrate,
  LandExpansionMigrateAction,
} from "../events/landExpansion/migrate";
import { CONFIG } from "lib/config";
import { OFFLINE_FARM } from "./landData";

export type PastAction = GameEvent & {
  createdAt: Date;
};

export interface Context {
  state: GameState;
  onChain: GameState;
  actions: PastAction[];
  offset: number;
  owner?: string;
  sessionId?: string;
  errorCode?: keyof typeof ERRORS;
  fingerprint?: string;
  itemsMintedAt?: MintedAt;
  notifications?: OnChainEvent[];
  maxedItem?: InventoryItemName | "SFL";
  goblinSwarm?: Date;
  deviceTrackerId?: string;
  status?: "COOL_DOWN";
}

type MintEvent = {
  type: "MINT";
  item: LimitedItemName;
  captcha: string;
};

type LevelUpEvent = {
  type: "LEVEL_UP";
  skill: SkillName;
};

type WithdrawEvent = {
  type: "WITHDRAW";
  sfl: number;
  ids: number[];
  amounts: string[];
  captcha: string;
};

type SyncEvent = {
  captcha: string;
  type: "SYNC";
};

type EditEvent = {
  placeable: BuildingName | CollectibleName;
  action: GameEventName<PlacementEvent>;
  type: "EDIT";
};

export type BlockchainEvent =
  | {
      type: "SAVE";
    }
  | SyncEvent
  | {
      type: "REFRESH";
    }
  | {
      type: "ACKNOWLEDGE";
    }
  | {
      type: "EXPIRED";
    }
  | {
      type: "CONTINUE";
    }
  | {
      type: "RESET";
    }
  | {
      type: "SKIP_MIGRATION";
    }
  | {
      type: "game.migrated";
      action: LandExpansionMigrateAction;
    }
  | WithdrawEvent
  | GameEvent
  | MintEvent
  | LevelUpEvent
  | EditEvent
  | { type: "EXPAND" }
  | { type: "RANDOMISE" }; // Test only

// // For each game event, convert it to an XState event + handler
const GAME_EVENT_HANDLERS: TransitionsConfig<Context, BlockchainEvent> =
  Object.keys(PLAYING_EVENTS).reduce(
    (events, eventName) => ({
      ...events,
      [eventName]: [
        {
          target: "hoarding",
          cond: (context: Context, event: PlayingEvent) => {
            const { valid } = checkProgress({
              state: context.state as GameState,
              action: event,
              onChain: context.onChain as GameState,
            });

            return !valid;
          },
          actions: assign((context: Context, event: PlayingEvent) => {
            const { maxedItem } = checkProgress({
              state: context.state as GameState,
              action: event,
              onChain: context.onChain as GameState,
            });

            return { maxedItem };
          }),
        },
        {
          actions: assign((context: Context, event: PlayingEvent) => ({
            state: processEvent({
              state: context.state as GameState,
              action: event,
            }) as GameState,
            actions: [
              ...context.actions,
              {
                ...event,
                createdAt: new Date(),
              },
            ],
          })),
        },
      ],
    }),
    {}
  );

const PLACEMENT_EVENT_HANDLERS: TransitionsConfig<Context, BlockchainEvent> =
  Object.keys(PLACEMENT_EVENTS).reduce(
    (events, eventName) => ({
      ...events,
      [eventName]: {
        actions: assign((context: Context, event: PlacementEvent) => ({
          state: processEvent({
            state: context.state as GameState,
            action: event,
          }) as GameState,
          actions: [
            ...context.actions,
            {
              ...event,
              createdAt: new Date(),
            },
          ],
        })),
      },
    }),
    {}
  );

export type BlockchainState = {
  value:
    | "loading"
    | "announcing"
    | "deposited"
    | "gameRules"
    | "playing"
    | "autosaving"
    | "syncing"
    | "synced"
    | "expanding"
    | "expanded"
    | "levelling"
    | "error"
    | "refreshing"
    | "swarming"
    | "hoarding"
    | "editing"
    | "noBumpkinFound"
    | "coolingDown"
    | "offerMigration"
    | "migrating"
    | "migrated"
    | "randomising"; // TEST ONLY
  context: Context;
};

export type StateKeys = keyof Omit<BlockchainState, "context">;
export type StateValues = BlockchainState[StateKeys];

export type MachineState = State<Context, BlockchainEvent, BlockchainState>;

export type MachineInterpreter = Interpreter<
  Context,
  any,
  BlockchainEvent,
  BlockchainState
>;

type Options = AuthContext & { isNoob: boolean };

// Hashed eth 0 value
export const INITIAL_SESSION =
  "0x0000000000000000000000000000000000000000000000000000000000000000";

export function startGame(authContext: Options) {
  return createMachine<Context, BlockchainEvent, BlockchainState>(
    {
      id: "gameMachine",
      initial: "loading",
      context: {
        actions: [],
        state: EMPTY,
        onChain: EMPTY,
        sessionId: INITIAL_SESSION,
        offset: 0,
      },
      states: {
        loading: {
          invoke: {
            src: async () => {
              const farmId = authContext.farmId as number;

              const {
                game: onChain,
                owner,
                bumpkin,
              } = await getOnChainState({
                farmAddress: authContext.address as string,
                id: farmId,
              });

              const onChainEvents = await unseenEvents({
                farmAddress: authContext.address as string,
                farmId: authContext.farmId as number,
              });

              // Get sessionId
              const sessionId =
                farmId &&
                (await metamask.getSessionManager().getSessionId(farmId));

              // Load the farm session
              if (sessionId) {
                const fingerprint = await getFingerPrint();

                const response = await loadSession({
                  farmId,
                  bumpkinTokenUri: bumpkin?.tokenURI,
                  sessionId,
                  token: authContext.rawToken as string,
                });

                if (!response) {
                  throw new Error("NO_FARM");
                }

                const {
                  game,
                  offset,
                  whitelistedAt,
                  itemsMintedAt,
                  deviceTrackerId,
                  status,
                } = response;

                // add farm address
                game.farmAddress = authContext.address;

                return {
                  state: {
                    ...game,
                    id: Number(authContext.farmId),
                  },
                  sessionId,
                  offset,
                  whitelistedAt,
                  fingerprint,
                  itemsMintedAt,
                  onChain,
                  owner,
                  notifications: onChainEvents,
                  deviceTrackerId,
                  status,
                };
              }

              return { state: OFFLINE_FARM, onChain };
            },
            onDone: {
              target: "notifying",
              actions: "assignGame",
            },
            onError: {
              target: "error",
              actions: "assignErrorMessage",
            },
          },
        },
        notifying: {
          always: [
            {
              target: "coolingDown",
              cond: (context: Context) => context.status === "COOL_DOWN",
            },
            {
              target: "deposited",
              cond: (context: Context) =>
                !!context.notifications && context.notifications?.length > 0,
            },
            {
              target: "announcing",
              cond: () => hasAnnouncements(),
            },
            {
              target: "gameRules",
              cond: () => {
                const lastRead = getGameRulesLastRead();
                return (
                  !lastRead ||
                  Date.now() - lastRead.getTime() > 7 * 24 * 60 * 60 * 1000
                );
              },
            },
            {
              target: "swarming",
              cond: () => isSwarming(),
            },
            {
              target: "noBumpkinFound",
              cond: (context: Context, event: any) =>
                !event.data?.state.bumpkin &&
                !context.state.bumpkin &&
                window.location.hash.includes("/land"),
            },
            {
              target: "offerMigration",
              cond: (context) =>
                CONFIG.NETWORK === "mumbai" &&
                !authContext.migrated &&
                canMigrate(context.state),
            },
            {
              target: "playing",
            },
          ],
        },
        offerMigration: {
          on: {
            SKIP_MIGRATION: {
              target: "playing",
            },
            "game.migrated": {
              target: "migrating",
              actions: assign(
                (context: Context, event: LandExpansionMigrateAction) => ({
                  state: processEvent({
                    state: context.state as GameState,
                    action: event,
                  }) as GameState,
                  actions: [
                    ...context.actions,
                    {
                      ...event,
                      createdAt: new Date(),
                    },
                  ],
                })
              ),
            },
          },
        },
        migrating: {
          invoke: {
            src: async (context) => {
              await autosave({
                farmId: Number(authContext.farmId),
                sessionId: context.sessionId as string,
                actions: context.actions,
                token: authContext.rawToken as string,
                offset: context.offset,
                fingerprint: context.fingerprint as string,
                deviceTrackerId: context.deviceTrackerId as string,
              });

              return true;
            },
            onDone: {
              target: "migrated",
            },
          },
        },
        migrated: {
          // type: "final",
          entry: () => {
            window.location.replace(
              `${window.location.pathname}#/land/${authContext.farmId}`
            );
          },
        },
        noBumpkinFound: {},
        deposited: {
          on: {
            ACKNOWLEDGE: {
              target: "refreshing",
            },
          },
        },
        announcing: {
          on: {
            ACKNOWLEDGE: {
              target: "notifying",
            },
          },
        },
        gameRules: {
          on: {
            ACKNOWLEDGE: {
              target: "notifying",
            },
          },
        },
        playing: {
          invoke: {
            /**
             * An in game loop that checks if Blockchain becomes out of sync
             * It is a rare event but it saves a user from making too much progress that would not be synced
             */
            src: (context) => (cb) => {
              const interval = setInterval(async () => {
                const sessionID = await metamask
                  .getSessionManager()
                  ?.getSessionId(authContext?.farmId as number);

                if (sessionID !== context.sessionId) {
                  cb("EXPIRED");
                }

                const bumpkins =
                  (await metamask.getBumpkinDetails()?.loadBumpkins()) ?? [];
                const tokenURI = bumpkins[0]?.tokenURI;

                if (tokenURI !== context.state.bumpkin?.tokenUri) {
                  cb("EXPIRED");
                }
              }, 1000 * 30);

              return () => {
                clearInterval(interval);
              };
            },
            onError: {
              target: "error",
              actions: "assignErrorMessage",
            },
          },
          on: {
            ...GAME_EVENT_HANDLERS,
            SAVE: {
              target: "autosaving",
            },
            SYNC: {
              target: "syncing",
            },
            LEVEL_UP: {
              target: "levelling",
            },
            EXPIRED: {
              target: "error",
              actions: assign((_) => ({
                errorCode: ERRORS.SESSION_EXPIRED as ErrorCode,
              })),
            },
            RESET: {
              target: "refreshing",
            },
            REFRESH: {
              target: "loading",
            },
            EXPAND: {
              target: "expanding",
            },
            EDIT: {
              target: "editing",
            },
            RANDOMISE: {
              target: "randomising",
            },
          },
        },
        autosaving: {
          on: {
            ...GAME_EVENT_HANDLERS,
          },
          invoke: {
            src: async (context, event) => {
              const saveAt = (event as any)?.data?.saveAt || new Date();

              if (context.actions.length === 0) {
                return { verified: true, saveAt, farm: context.state };
              }

              const { verified, farm } = await autosave({
                farmId: Number(authContext.farmId),
                sessionId: context.sessionId as string,
                actions: context.actions,
                token: authContext.rawToken as string,
                offset: context.offset,
                fingerprint: context.fingerprint as string,
                deviceTrackerId: context.deviceTrackerId as string,
              });

              // This gives the UI time to indicate that a save is taking place both when clicking save
              // and when autosaving
              await new Promise((res) => setTimeout(res, 1000));

              return {
                saveAt,
                verified,
                farm,
              };
            },
            onDone: [
              {
                target: "playing",
                actions: assign((context: Context, event) => {
                  // Actions that occured since the server request
                  const recentActions = context.actions.filter(
                    (action) =>
                      action.createdAt.getTime() > event.data.saveAt.getTime()
                  );

                  return {
                    actions: recentActions,
                    state: updateGame(event.data.farm, context.state),
                  };
                }),
              },
            ],
            onError: {
              target: "error",
              actions: "assignErrorMessage",
            },
          },
        },
        syncing: {
          invoke: {
            src: async (context, event) => {
              // Autosave just in case
              if (context.actions.length > 0) {
                await autosave({
                  farmId: Number(authContext.farmId),
                  sessionId: context.sessionId as string,
                  actions: context.actions,
                  token: authContext.rawToken as string,
                  offset: context.offset,
                  fingerprint: context.fingerprint as string,
                  deviceTrackerId: context.deviceTrackerId as string,
                });
              }

              const { sessionId } = await sync({
                farmId: Number(authContext.farmId),
                sessionId: context.sessionId as string,
                token: authContext.rawToken as string,
                captcha: (event as SyncEvent).captcha,
              });

              return {
                sessionId: sessionId,
              };
            },
            onDone: {
              target: "synced",
              actions: assign((_, event) => ({
                sessionId: event.data.sessionId,
                actions: [],
              })),
            },
            onError: [
              {
                target: "playing",
                cond: (_, event: any) =>
                  event.data.message === ERRORS.REJECTED_TRANSACTION,
                actions: assign((_) => ({
                  actions: [],
                })),
              },
              {
                target: "error",
                actions: "assignErrorMessage",
              },
            ],
          },
        },
        levelling: {
          invoke: {
            src: async (context, event) => {
              // Autosave just in case
              if (context.actions.length > 0) {
                await autosave({
                  farmId: Number(authContext.farmId),
                  sessionId: context.sessionId as string,
                  actions: context.actions,
                  token: authContext.rawToken as string,
                  offset: context.offset,
                  fingerprint: context.fingerprint as string,
                  deviceTrackerId: context.deviceTrackerId as string,
                });
              }

              const { farm } = await levelUp({
                farmId: Number(authContext.farmId),
                sessionId: context.sessionId as string,
                token: authContext.rawToken as string,
                fingerprint: context.fingerprint as string,
                skill: (event as LevelUpEvent).skill,
                offset: context.offset,
                deviceTrackerId: context.deviceTrackerId as string,
              });

              return {
                farm,
              };
            },
            onDone: [
              {
                target: "playing",
                actions: assign((_, event) => ({
                  // Remove events
                  actions: [],
                  // Update immediately with state from server
                  state: event.data.farm,
                })),
              },
            ],
            onError: {
              target: "error",
              actions: "assignErrorMessage",
            },
          },
        },

        refreshing: {
          invoke: {
            src: async (context, event) => {
              // Autosave just in case
              const { success } = await reset({
                farmId: Number(authContext.farmId),
                token: authContext.rawToken as string,
                fingerprint: context.fingerprint as string,
              });

              return {
                success,
              };
            },
            onDone: [
              {
                target: "loading",
              },
            ],
            onError: {
              target: "error",
              actions: "assignErrorMessage",
            },
          },
        },
        error: {
          on: {
            CONTINUE: "playing",
          },
        },
        synced: {
          on: {
            REFRESH: {
              target: "loading",
            },
          },
        },
        //  withdrawn
        expanding: {
          invoke: {
            src: async (context, event) => {
              // Autosave just in case
              if (context.actions.length > 0) {
                await autosave({
                  farmId: Number(authContext.farmId),
                  sessionId: context.sessionId as string,
                  actions: context.actions,
                  token: authContext.rawToken as string,
                  offset: context.offset,
                  fingerprint: context.fingerprint as string,
                  deviceTrackerId: context.deviceTrackerId as string,
                });
              }

              const sessionId = await expand({
                farmId: Number(authContext.farmId),
                token: authContext.rawToken as string,
              });

              return {
                sessionId: sessionId,
              };
            },
            onDone: {
              target: "expanded",
              actions: assign((_, event) => ({
                sessionId: event.data.sessionId,
                actions: [],
              })),
            },
            onError: [
              {
                target: "playing",
                cond: (_, event: any) =>
                  event.data.message === ERRORS.REJECTED_TRANSACTION,
                actions: assign((_) => ({
                  actions: [],
                })),
              },
              {
                target: "error",
                actions: "assignErrorMessage",
              },
            ],
          },
        },
        expanded: {
          on: {
            REFRESH: {
              target: "loading",
            },
          },
        },
        hoarding: {
          on: {
            SYNC: {
              target: "syncing",
            },
            ACKNOWLEDGE: {
              target: "playing",
            },
          },
        },
        swarming: {
          on: {
            REFRESH: {
              target: "loading",
            },
          },
        },
        editing: {
          invoke: {
            id: "editing",
            autoForward: true,
            src: editingMachine,
            data: {
              placeable: (_: Context, event: EditEvent) => event.placeable,
              action: (_: Context, event: EditEvent) => event.action,
              coordinates: { x: 0, y: 0 },
              collisionDetected: true,
            },
            onDone: {
              target: "playing",
            },
            onError: [
              {
                target: "playing",
                cond: (_, event: any) =>
                  event.data.message === ERRORS.REJECTED_TRANSACTION,
              },
              {
                target: "error",
                actions: "assignErrorMessage",
              },
            ],
          },
          on: {
            ...PLACEMENT_EVENT_HANDLERS,
          },
        },
        coolingDown: {},
        randomising: {
          invoke: {
            src: async () => {
              const { expansions } = await generateTestLand();

              return { expansions };
            },
            onDone: {
              target: "playing",
              actions: assign<Context, any>({
                state: (context, event) => ({
                  ...context.state,
                  expansions: event.data.expansions,
                }),
              }),
            },
            onError: {
              target: "error",
              actions: "assignErrorMessage",
            },
          },
        },
      },
    },
    {
      actions: {
        assignErrorMessage: assign<Context, any>({
          errorCode: (_context, event) => event.data.message,
          actions: [],
        }),
        assignGame: assign<Context, any>({
          state: (_, event) => event.data.state,
          onChain: (_, event) => event.data.onChain,
          owner: (_, event) => event.data.owner,
          offset: (_, event) => event.data.offset,
          sessionId: (_, event) => event.data.sessionId,
          fingerprint: (_, event) => event.data.fingerprint,
          itemsMintedAt: (_, event) => event.data.itemsMintedAt,
          notifications: (_, event) => event.data.notifications,
          deviceTrackerId: (_, event) => event.data.deviceTrackerId,
          status: (_, event) => event.data.status,
        }),
      },
    }
  );
}
