import React, { useState } from "react";
import { PIXEL_SCALE } from "features/game/lib/constants";
import { Modal } from "react-bootstrap";
import boat from "assets/npcs/island_boat_pirate.png";
import close from "assets/icons/close.png";
import { Panel } from "components/ui/Panel";
import { MapPlacement } from "features/game/expansion/components/MapPlacement";
import { Tab } from "components/ui/Tab";
import { IslandList } from "./IslandList";
import { Bumpkin } from "features/game/types/game";
import { DynamicNFT } from "features/bumpkins/components/DynamicNFT";

interface Props {
  bumpkin: Bumpkin | undefined;
  x: number;
  y: number;
}

export const IslandTravel = ({ bumpkin, x, y }: Props) => {
  const [openIslandList, setOpenIslandList] = useState(false);

  return (
    <>
      <MapPlacement x={x} y={y}>
        <div
          style={{
            width: `${68 * PIXEL_SCALE}px`,
          }}
        >
          <img
            src={boat}
            onClick={() => setOpenIslandList(true)}
            className="relative cursor-pointer hover:img-highlight"
            style={{
              width: `${68 * PIXEL_SCALE}px`,
            }}
          />
        </div>
      </MapPlacement>

      <Modal
        centered
        show={openIslandList}
        onHide={() => setOpenIslandList(false)}
      >
        <div className="absolute w-48 -left-4 -top-32 -z-10">
          <DynamicNFT
            bumpkinParts={{
              body: "Goblin Potion",
              hair: "Sun Spots",
              pants: "Brown Suspenders",
              shirt: "SFL T-Shirt",
              tool: "Sword",
              background: "Farm Background",
              shoes: "Black Farmer Boots",
            }}
          />
        </div>
        <Panel className="pt-5 relative">
          <div className="flex justify-between absolute top-1.5 left-0.5 right-0 items-center">
            <div className="flex">
              <Tab isActive>
                <img src={boat} className="h-5 mr-2" />
                <span className="text-sm text-shadow">Travel To</span>
              </Tab>
            </div>
            <img
              src={close}
              className="h-6 cursor-pointer mr-2 mb-1"
              onClick={() => setOpenIslandList(false)}
            />
          </div>
          <div
            style={{
              minHeight: "200px",
            }}
          >
            <IslandList bumpkin={bumpkin} />
          </div>
        </Panel>
      </Modal>
    </>
  );
};
