import React, { useRef, useEffect, useContext } from "react";
import ScrollContainer from "react-indiana-drag-scroll";
import * as Auth from "features/auth/lib/Provider";

import ocean from "assets/decorations/ocean.png";

import { ToastProvider } from "../toast/ToastQueueProvider";
import mapMovement from "../lib/mapMovement";
import { useParams } from "react-router-dom";
import { useActor } from "@xstate/react";
import { GameProvider } from "../GameProvider";
import { Game } from "./Game";

export const LandExpansion: React.FC = () => {
  const { authService } = useContext(Auth.Context);
  const [authState, send] = useActor(authService);
  // catching and passing scroll container to keyboard listeners
  const container = useRef(null);
  const { id } = useParams();

  useEffect(() => {
    // Our authMachine currently sits outside of our navigation. So if a the machine was in a visiting
    // state and the player loaded this route which can happen using the browser back button then fire
    // the RETURN event to move the authMachine out of the invalid state.
    if (
      authState.matches({ connected: "visitingContributor" }) ||
      authState.matches("visiting")
    ) {
      send("RETURN");
    }
  }, []);

  useEffect(() => {
    mapMovement.addListeners(container.current);
    return () => {
      mapMovement.removeListeners();
    };
  }, [container]);

  // Load data
  return (
    <GameProvider key={id}>
      <ToastProvider>
        <ScrollContainer
          className="bg-blue-300 overflow-scroll relative w-full h-full"
          innerRef={container}
          ignoreElements={"*[data-prevent-drag-scroll]"}
        >
          <div
            className="relative h-islandGameboard w-islandGameboard"
            // TODO dynamic game board size based on tile dimensions
          >
            <div
              className="absolute inset-0 bg-repeat w-full h-full"
              style={{
                backgroundImage: `url(${ocean})`,
                backgroundSize: "100px",
                imageRendering: "pixelated",
              }}
            />
            <Game />
          </div>
        </ScrollContainer>
      </ToastProvider>
    </GameProvider>
  );
};
