# Chaque bloc du jeu, et où en est le portage

Généré par `python tools/build_checklist.py`, depuis la liste de classes que le
jeu donne lui-même. Un bloc de Mindustry appartient à une classe Java, et c'est la
classe qui décide de son comportement : deux blocs de la même classe partagent un
`updateTile` et ne diffèrent que par leurs nombres. Porter une classe coche donc
d'un coup tous les blocs qui s'en servent.

Cocher une case veut dire deux choses, jamais une seule : la classe est transcrite
depuis la source du jeu, **et** un scénario la mesure dans un vrai serveur. Sans le
second, c'est une intuition qui a l'air d'un portage.

**105 classes à reproduire**, pour 228 blocs. 182 autres sont du décor : sol, murs statiques, arbres, échafaudages de construction. Rien à reproduire, ils ne bougent pas.

## Fait : 56 sur 105

- [x] `GenericCrafter` - 17 blocs - toute usine : entrees, duree, sorties
      blast-mixer, coal-centrifuge, cryofluid-mixer, electrolyzer, graphite-press, kiln, et 11 autres
- [x] `ItemTurret` - 17 blocs - mange ses munitions au rythme de son tir
      breach, cyclone, diffuse, disperse, duo, foreshadow, et 11 autres
- [ ] `Reconstructor` - 8 blocs - ameliore une unite en une meilleure
      additive-reconstructor, exponential-reconstructor, mech-refabricator, multiplicative-reconstructor, prime-refabricator, ship-refabricator, et 2 autres
- [x] `ConsumeGenerator` - 6 blocs - brule quelque chose et fait de l'energie
      chemical-combustion-chamber, combustion-generator, differential-generator, pyrolysis-generator, rtg-generator, steam-generator
- [x] `CoreBlock` - 6 blocs - le noyau : un coffre qui compte
      core-acropolis, core-bastion, core-citadel, core-foundation, core-nucleus, core-shard
- [x] `HeatProducer` - 6 blocs - chauffe, pour la moitie Erekir du jeu
      electric-heater, heat-reactor, heat-source, oxidation-chamber, phase-heater, slag-heater
- [x] `LiquidRouter` - 6 blocs - un routeur a liquide, qui est aussi une reserve
      liquid-container, liquid-router, liquid-tank, reinforced-liquid-container, reinforced-liquid-router, reinforced-liquid-tank
- [x] `UnitFactory` - 6 blocs - fabrique des unites : c'est ce qu'il a demande
      air-factory, ground-factory, mech-fabricator, naval-factory, ship-fabricator, tank-fabricator
- [x] `HeatCrafter` - 5 blocs - une usine qui a besoin de chaleur en plus
      atmospheric-concentrator, carbide-crucible, cyanogen-synthesizer, phase-synthesizer, surge-crucible
- [x] `Drill` - 4 blocs - sort du sol ce qu'il y a dessous
      blast-drill, laser-drill, mechanical-drill, pneumatic-drill
- [ ] `LogicBlock` - 4 blocs - un processeur : execute un programme
      hyper-processor, logic-processor, micro-processor, world-processor
- [x] `PowerTurret` - 4 blocs - une tourelle qui mange de l'energie
      afflict, arc, lancer, malign
- [x] `Pump` - 4 blocs - pompe le liquide sous elle
      impulse-pump, mechanical-pump, reinforced-pump, rotary-pump
- [x] `StorageBlock` - 4 blocs - un coffre : prend tout, ne pousse rien
      container, reinforced-container, reinforced-vault, vault
- [x] `AttributeCrafter` - 3 blocs - une usine dont la vitesse depend du sol dessous
      cultivator, silicon-crucible, vent-condenser
- [x] `HeatConductor` - 3 blocs - porte la chaleur
      heat-redirector, heat-router, small-heat-redirector
- [x] `PowerNode` - 3 blocs - relie le reseau
      power-node, power-node-large, surge-tower
- [ ] `UnitAssembler` - 3 blocs - assemble une unite a partir de plans
      mech-assembler, ship-assembler, tank-assembler
- [x] `ArmoredConduit` - 2 blocs
      plated-conduit, reinforced-conduit
- [x] `Battery` - 2 blocs - stocke l'energie
      battery, battery-large
- [ ] `BeamDrill` - 2 blocs
      large-plasma-bore, plasma-bore
- [x] `BeamNode` - 2 blocs
      beam-node, beam-tower
- [ ] `BurstDrill` - 2 blocs
      eruption-drill, impact-drill
- [ ] `CanvasBlock` - 2 blocs
      canvas, large-canvas
- [x] `Conduit` - 2 blocs - un tuyau : directionnel, comme une bande
      conduit, pulse-conduit
- [ ] `Constructor` - 2 blocs
      constructor, large-constructor
- [x] `Conveyor` - 2 blocs - une bande : positions d'objets le long d'elle-meme
      conveyor, titanium-conveyor
- [x] `Duct` - 2 blocs - les bandes d'Erekir, une seule case a la fois
      armored-duct, duct
- [ ] `LaunchPad` - 2 blocs
      advanced-launch-pad, launch-pad
- [x] `LiquidBridge` - 2 blocs - un pont a liquide
      bridge-conduit, phase-conduit
- [x] `LiquidJunction` - 2 blocs - croise deux tuyaux
      liquid-junction, reinforced-liquid-junction
- [x] `LiquidTurret` - 2 blocs
      tsunami, wave
- [ ] `LogicDisplay` - 2 blocs
      large-logic-display, logic-display
- [x] `MendProjector` - 2 blocs - repare, ne change aucun debit
      mend-projector, mender
- [x] `OverdriveProjector` - 2 blocs - accelere ce qui l'entoure
      overdrive-dome, overdrive-projector
- [x] `OverflowDuct` - 2 blocs
      overflow-duct, underflow-duct
- [x] `OverflowGate` - 2 blocs - tout droit d'abord, de cote seulement si ca bouchonne
      overflow-gate, underflow-gate
- [ ] `PayloadConveyor` - 2 blocs
      payload-conveyor, reinforced-payload-conveyor
- [ ] `PayloadDeconstructor` - 2 blocs
      deconstructor, small-deconstructor
- [ ] `PayloadMassDriver` - 2 blocs
      large-payload-mass-driver, payload-mass-driver
- [ ] `PayloadRouter` - 2 blocs
      payload-router, reinforced-payload-router
- [ ] `RepairTurret` - 2 blocs
      repair-point, repair-turret
- [x] `Router` - 2 blocs - repartit au tourniquet
      distributor, router
- [x] `Separator` - 2 blocs - sort un objet au hasard selon des poids
      disassembler, separator
- [x] `SolarGenerator` - 2 blocs - de l'energie, sans rien
      solar-panel, solar-panel-large
- [x] `Sorter` - 2 blocs - laisse passer ce qu'on a regle, devie le reste
      inverted-sorter, sorter
- [x] `StackConveyor` - 2 blocs - deplace une pile entiere de case en case
      plastanium-conveyor, surge-conveyor
- [ ] `SwitchBlock` - 2 blocs
      switch, world-switch
- [x] `ThermalGenerator` - 2 blocs - de l'energie a partir du sol chaud
      thermal-generator, turbine-condenser
- [ ] `WallCrafter` - 2 blocs
      cliff-crusher, large-cliff-crusher
- [ ] `Accelerator` - 1 bloc
      interplanetary-accelerator
- [x] `ArmoredConveyor` - 1 bloc
      armored-conveyor
- [ ] `AutoDoor` - 1 bloc
      blast-door
- [x] `BufferedItemBridge` - 1 bloc
      bridge-conveyor
- [x] `BuildTurret` - 1 bloc - ne consomme rien tant qu'il n'a rien a reconstruire
      build-tower
- [ ] `ColoredFloor` - 1 bloc
      colored-floor
- [ ] `ColoredWall` - 1 bloc
      colored-wall
- [ ] `ContinuousLiquidTurret` - 1 bloc
      sublimate
- [ ] `ContinuousTurret` - 1 bloc
      lustre
- [x] `DirectionLiquidBridge` - 1 bloc
      reinforced-bridge-conduit
- [x] `DirectionalUnloader` - 1 bloc
      duct-unloader
- [x] `DuctBridge` - 1 bloc
      duct-bridge
- [x] `DuctRouter` - 1 bloc
      duct-router
- [x] `ForceProjector` - 1 bloc
      force-projector
- [ ] `Fracker` - 1 bloc
      oil-extractor
- [x] `HeaterGenerator` - 1 bloc
      neoplasia-reactor
- [x] `ImpactReactor` - 1 bloc - consomme et produit, avec une chauffe
      impact-reactor
- [ ] `Incinerator` - 1 bloc
      incinerator
- [x] `ItemBridge` - 1 bloc - porte par dessus un trou, vers la case qu'il retient
      phase-conveyor
- [ ] `ItemIncinerator` - 1 bloc
      slag-incinerator
- [x] `ItemSource` - 1 bloc
      item-source
- [ ] `ItemVoid` - 1 bloc
      item-void
- [x] `Junction` - 1 bloc - quatre files, une par cote, chacune ressort en face
      junction
- [ ] `LandingPad` - 1 bloc
      landing-pad
- [x] `LaserTurret` - 1 bloc
      meltdown
- [ ] `LegacyCommandCenter` - 1 bloc
      command-center
- [x] `LiquidSource` - 1 bloc
      liquid-source
- [ ] `LiquidVoid` - 1 bloc
      liquid-void
- [ ] `LongPowerNode` - 1 bloc
      beam-link
- [ ] `MassDriver` - 1 bloc
      mass-driver
- [x] `NuclearReactor` - 1 bloc - de l'energie, et une explosion si on la neglige
      thorium-reactor
- [ ] `PayloadLoader` - 1 bloc
      payload-loader
- [ ] `PayloadSource` - 1 bloc
      payload-source
- [ ] `PayloadUnloader` - 1 bloc
      payload-unloader
- [ ] `PayloadVoid` - 1 bloc
      payload-void
- [ ] `PointDefenseTurret` - 1 bloc
      segment
- [ ] `PowerDiode` - 1 bloc
      diode
- [x] `PowerSource` - 1 bloc
      power-source
- [ ] `PowerVoid` - 1 bloc
      power-void
- [x] `Radar` - 1 bloc - tire de l'energie en continu, et rien d'autre
      radar
- [ ] `RegenProjector` - 1 bloc
      regen-projector
- [ ] `RepairTower` - 1 bloc
      unit-repair-tower
- [ ] `Seaweed` - 1 bloc
      redweed
- [ ] `ShieldWall` - 1 bloc
      shielded-wall
- [ ] `ShockwaveTower` - 1 bloc
      shockwave-tower
- [ ] `SolidPump` - 1 bloc
      water-extractor
- [x] `StackRouter` - 1 bloc
      surge-router
- [ ] `Thruster` - 1 bloc
      thruster
- [ ] `TileableLogicDisplay` - 1 bloc
      tile-logic-display
- [x] `TractorBeamTurret` - 1 bloc
      parallax
- [ ] `UnitAssemblerModule` - 1 bloc
      basic-assembler-module
- [ ] `UnitCargoLoader` - 1 bloc
      unit-cargo-loader
- [ ] `UnitCargoUnloadPoint` - 1 bloc
      unit-cargo-unload-point
- [x] `Unloader` - 1 bloc - tire hors d'un coffre, onze par seconde
      unloader
- [x] `VariableReactor` - 1 bloc - de l'energie proportionnelle a ce qu'on lui donne
      flux-reactor

## Ce qui est coché et reste incomplet

Une case cochée dit que la classe est transcrite et mesurée, pas
qu'aucun de ses blocs ne pose problème. Ce qui manque encore, nommé
plutôt que laissé à découvrir :

- **Un bloc ne retient qu'un liquide à la fois.** Le jeu, lui, garde un
  compteur par liquide et n'utilise `current()` que pour décider ce
  qu'il accepte. Ça ne se voit que sur les blocs qui en boivent deux :
  `chemical-combustion-chamber` (ozone et arkycite), `pyrolysis-generator`
  (scorie et arkycite), `neoplasia-reactor` (arkycite et eau). Les trois
  sont d'Erekir, aucun n'est mesuré, et aucun ne tournera correctement
  tant que le module liquide n'aura pas plusieurs cases.

## Posés par un joueur, mais sans effet sur ce qui circule

Un mur est un mur : il arrête des balles et ne déplace rien. Rien à
porter, et rien à mesurer non plus.

- `Wall` : 24
- `MessageBlock` : 3
- `MemoryBlock` : 3
- `Door` : 2
- `BaseShield` : 2
- `ShockMine` : 1
- `LightBlock` : 1

## Le décor, rien à faire

- `Floor` : 72
- `StaticWall` : 26
- `ConstructBlock` : 16
- `StaticProp` : 14
- `OreBlock` : 13
- `SteamVent` : 8
- `StaticTree` : 4
- `TallBlock` : 4
- `ShallowLiquid` : 3
- `LegacyUnitFactory` : 3
- `TreeBlock` : 2
- `Prop` : 2
- `SeaBush` : 2
- `CharacterOverlay` : 2
- `RuneOverlay` : 2
- `OverlayFloor` : 2
- `AirBlock` : 1
- `SpawnBlock` : 1
- `RemoveWall` : 1
- `RemoveOre` : 1
- `Cliff` : 1
- `EmptyFloor` : 1
- `LegacyMechPad` : 1
