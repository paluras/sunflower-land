import Decimal from "decimal.js-light";
import { CropName, CROPS } from "../../types/crops";
import { GameState } from "../../types/game";
import cloneDeep from "lodash.clonedeep";
import { getSellPrice } from "features/game/lib/boosts";
import { SellableItem } from "../sell";
import { trackActivity } from "features/game/types/bumpkinActivity";

export type SellCropAction = {
  type: "crop.sold";
  crop: CropName;
  amount: number;
};

const SELLABLE = { ...CROPS() };

type Options = {
  state: GameState;
  action: SellCropAction;
};
export function sellCrop({ state, action }: Options): GameState {
  const game = cloneDeep(state);

  const { bumpkin } = game;

  if (bumpkin === undefined) {
    throw new Error("You do not have a Bumpkin");
  }

  if (!(action.crop in SELLABLE)) {
    throw new Error("Not for sale");
  }

  const amount = new Decimal(action.amount);
  if (amount.lessThanOrEqualTo(0)) {
    throw new Error("Invalid amount");
  }

  const sellables = SELLABLE[action.crop];

  const count = game.inventory[action.crop] || new Decimal(0);

  if (count.lessThan(action.amount)) {
    throw new Error("Insufficient quantity to sell");
  }

  const price = getSellPrice(sellables as SellableItem, game.inventory);

  const sflEarned = price.mul(action.amount);
  bumpkin.activity = trackActivity("SFL Earned", bumpkin.activity, sflEarned);

  return {
    ...game,
    bumpkin,
    balance: game.balance.add(sflEarned),
    inventory: {
      ...game.inventory,
      [sellables.name]: count.sub(amount),
    },
  };
}
