import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { emblemOf } from '../ecosystem/labels';
import { useEcosystem } from '../state/ecosystemStore';
import { CARD_Y, TAG, isVisible, legibility } from './labels';
import { tagTexture } from './tagTexture';
import type { PlacedPlant } from './types';

/**
 * Plant tags: which one is this?
 *
 * A nursery label pushed into the soil beside each stem — a stake and a card
 * with the thing's mark and name on it. They are how identity enters a scene
 * that otherwise says nothing in words, and the rule that makes them affordable
 * is that **they are not there until you are** (see `labels.ts`): from across
 * the house you see plants, and walking up to one resolves its name. Thirty-two
 * captions floating over a garden would be a chart with foliage.
 *
 * Everything here is off the reading. A tag never moves with a metric, never
 * changes colour, and never appears or disappears for any reason but where the
 * camera is standing. That is what lets it be as legible as it likes: it is the
 * answer to the *second* question, asked after the garden has already told you
 * something is wrong, and it competes with nothing.
 *
 * The tag is also the affordance for the third question. Tapping one opens the
 * detail panel (`Detail.tsx`), which is why the card carries the pointer
 * handlers rather than the plant: a plant is drawn as a few hundred instanced
 * cylinders shared with every other plant in the garden, and picking one out of
 * that is a lookup table nobody needs when there is already a signpost standing
 * next to it with its name on.
 */

/** How the card sits: a hair of tilt back, the way a pushed-in label leans. */
const TILT = -0.14;

/** Stake and card colours. Weathered zinc, which is what these are made of. */
const STAKE = '#b9bec0';

/**
 * How many cards may be drawn in one frame.
 *
 * Textures are built when a plant comes within range rather than when the
 * garden opens (see `cards` below), which moves the work from one lump at the
 * door to a trickle as you walk. Walking into a bed can still bring a dozen
 * into range at once, and a dozen canvases in a single frame is a visible hitch,
 * so the queue is metered.
 *
 * A card waiting its turn is not a gap: `legibility` is a smoothstep that
 * reaches `LABEL_CUTOFF` — one percent — exactly where a tag becomes visible, so
 * for the frame or two before its texture lands it is drawn blank at an opacity
 * nobody can see. The fade pays for the meter.
 */
const CARDS_PER_FRAME = 3;

export function Tags({ plants }: { plants: PlacedPlant[] }) {
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  const select = useEcosystem((state) => state.select);
  const selectedId = useEcosystem((state) => state.selectedId);

  /**
   * What each tag says — but not yet the picture of it.
   *
   * Keyed on everything drawn on a card, so a relabelled node redraws and a
   * telemetry tick — which touches none of these — does not.
   *
   * **The texture is deliberately not built here.** It used to be, and for two
   * gardens of thirty-two that was free. The world garden holds a hundred and
   * ninety-three, and a card is 588 × 210: building them all on entry is about
   * 95MB of texture before mipmaps, uploaded in one go, for a set of labels of
   * which perhaps a dozen are ever inside the nine-metre fade radius at once.
   *
   * Worth being precise about what this does and does not fix, because the
   * obvious guess was wrong. Drawing the canvases is *not* expensive — all 193
   * measure 135ms, which is not what makes a large garden slow. What this saves
   * is memory and upload bandwidth, which is why the fix is to build them on
   * approach rather than to build them faster.
   *
   * A texture, once built, is kept until the garden changes. The worst case is
   * therefore the old behaviour — walk up to all 193 and you have paid for all
   * 193 — but it is reached by walking rather than by opening a door, and it is
   * paid a card at a time.
   */
  const cards = useMemo(
    () =>
      plants.map((plant) => ({
        id: plant.node.id,
        position: plant.position,
        emblem: emblemOf(plant.node),
        label: plant.node.label,
      })),
    [plants.map((p) => `${p.node.id}|${p.node.label}`).join(',')],
  );

  /** Cards drawn so far, by node id. Emptied when the garden changes. */
  const textures = useRef(new Map<string, THREE.CanvasTexture>());

  useEffect(() => {
    const drawn = textures.current;
    return () => {
      for (const texture of drawn.values()) texture.dispose();
      drawn.clear();
    };
  }, [cards]);

  const tags = useRef<(THREE.Group | null)[]>([]);
  const cardGroups = useRef<(THREE.Group | null)[]>([]);
  const materials = useRef<(THREE.MeshStandardMaterial | null)[]>([]);
  const stakes = useRef<(THREE.MeshStandardMaterial | null)[]>([]);
  const eye = useMemo(() => new THREE.Vector3(), []);
  const here = useMemo(() => new THREE.Vector3(), []);

  /**
   * One loop for every tag, rather than a `useFrame` each.
   *
   * It does two things a tag cannot do for itself. It fades the whole tag —
   * stake as well as card — by how far the camera is from *this* plant, which is
   * the whole interaction; and it turns the card to face the camera about the
   * vertical only, so a tag reads head-on from anywhere on the path while still
   * standing in the soil like the physical object it is. Billboarding on all
   * three axes would let a tag lie back and look at the ceiling.
   *
   * The stake fades with the card rather than staying put, and that is not a
   * detail. Left standing, thirty-two little posts turn every bed into a nursery
   * flat seen from the road — visual noise carrying no signal, at exactly the
   * distance where the plants are supposed to be the only thing being read.
   */
  useFrame(() => {
    camera.getWorldPosition(eye);
    let drawnThisFrame = 0;

    for (let i = 0; i < cards.length; i++) {
      const tag = tags.current[i];
      const card = cardGroups.current[i];
      const material = materials.current[i];
      const stake = stakes.current[i];
      if (!tag || !card || !material || !stake) continue;

      tag.getWorldPosition(here);
      const distance = here.distanceTo(eye);
      const visible = isVisible(distance);
      tag.visible = visible;
      if (!visible) continue;

      // In range and never drawn: draw it now, up to this frame's allowance.
      // Assigning a map where there was none changes the shader program, so the
      // material has to be told — without `needsUpdate` the card stays blank.
      if (!material.map && drawnThisFrame < CARDS_PER_FRAME) {
        const entry = cards[i];
        let texture = textures.current.get(entry.id);
        if (!texture) {
          texture = tagTexture(entry.emblem, entry.label);
          textures.current.set(entry.id, texture);
          drawnThisFrame++;
        }
        material.map = texture;
        material.emissiveMap = texture;
        material.needsUpdate = true;
      }

      const fade = legibility(distance);
      material.opacity = fade;
      stake.opacity = fade;
      card.rotation.y = Math.atan2(eye.x - here.x, eye.z - here.z);
    }
  });

  const hover = (on: boolean) => {
    gl.domElement.style.cursor = on ? 'pointer' : '';
  };

  return (
    <group>
      {/* Every tag starts hidden, so a garden never opens with a frame of them
          at full size before the first fade lands. */}
      {cards.map((card, i) => (
        <group
          key={card.id}
          ref={(node) => {
            tags.current[i] = node;
          }}
          position={[card.position[0] + TAG.offset, 0, card.position[2] + 0.12]}
          visible={false}
        >
          <mesh position={[0, TAG.stake / 2, 0]}>
            <boxGeometry args={[TAG.stakeWidth, TAG.stake, TAG.stakeThickness]} />
            <meshStandardMaterial
              ref={(node) => {
                stakes.current[i] = node;
              }}
              color={STAKE}
              roughness={0.5}
              metalness={0.35}
              transparent
              opacity={0}
              depthWrite={false}
            />
          </mesh>

          {/* Turned to face the camera by the loop above. */}
          <group
            ref={(node) => {
              cardGroups.current[i] = node;
            }}
            position={[0, CARD_Y, 0]}
          >
            <mesh
              rotation={[TILT, 0, 0]}
              scale={card.id === selectedId ? 1.08 : 1}
              onClick={(event) => {
                event.stopPropagation();
                // Tapping the open one closes it, so the tag is a switch rather
                // than a thing you can only turn on.
                select(card.id === selectedId ? null : card.id);
              }}
              onPointerOver={(event) => {
                event.stopPropagation();
                hover(true);
              }}
              onPointerOut={() => hover(false)}
            >
              <planeGeometry args={[TAG.width, TAG.height]} />
              <meshStandardMaterial
                ref={(node) => {
                  materials.current[i] = node;
                }}
                // `map` and `emissiveMap` are attached by the loop above when
                // the plant first comes within range, not here — see `cards`.
                // Lit like everything else, so a tag sits in the scene's light —
                // but with the card's own image as a faint emissive too, or it
                // would go unreadable at dusk exactly when a real one does, and
                // a label you cannot read at night is a bug rather than realism.
                emissive="#ffffff"
                emissiveIntensity={0.35}
                roughness={0.85}
                transparent
                opacity={0}
                depthWrite={false}
                side={THREE.DoubleSide}
              />
            </mesh>
          </group>
        </group>
      ))}
    </group>
  );
}
