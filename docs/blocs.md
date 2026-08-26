# Chaque bloc du jeu, et où en est le portage

Généré par `python tools/build_checklist.py`, depuis la liste de classes que le
jeu donne lui-même. Un bloc de Mindustry appartient à une classe Java, et c'est la
classe qui décide de son comportement : deux blocs de la même classe partagent un
`updateTile` et ne diffèrent que par leurs nombres. Porter une classe coche donc
d'un coup tous les blocs qui s'en servent.

Cocher une case veut dire deux choses, jamais une seule : la classe est transcrite
depuis la source du jeu, **et** un scénario la mesure dans un vrai serveur. Sans le
second, c'est une intuition qui a l'air d'un portage.

**103 classes à reproduire**, pour 226 blocs. 182 autres sont du décor : sol, murs statiques, arbres, échafaudages de construction. Rien à reproduire, ils ne bougent pas.

## Fait : 19 sur 103

- [x] `GenericCrafter` &mdash; 17 blocs &mdash; toute usine : entrees, duree, sorties
      blast-mixer, coal-centrifuge, cryofluid-mixer, electrolyzer, graphite-press, kiln, et 11 autres
- [ ] `ItemTurret` &mdash; 17 blocs &mdash; mange ses munitions au rythme de son tir
      breach, cyclone, diffuse, disperse, duo, foreshadow, et 11 autres
- [ ] `Reconstructor` &mdash; 8 blocs &mdash; ameliore une unite en une meilleure
      additive-reconstructor, exponential-reconstructor, mech-refabricator, multiplicative-reconstructor, prime-refabricator, ship-refabricator, et 2 autres
- [x] `ConsumeGenerator` &mdash; 6 blocs &mdash; brule quelque chose et fait de l'energie
      chemical-combustion-chamber, combustion-generator, differential-generator, pyrolysis-generator, rtg-generator, steam-generator
- [ ] `CoreBlock` &mdash; 6 blocs &mdash; le noyau : un coffre qui compte
      core-acropolis, core-bastion, core-citadel, core-foundation, core-nucleus, core-shard
- [ ] `HeatProducer` &mdash; 6 blocs &mdash; chauffe, pour la moitie Erekir du jeu
      electric-heater, heat-reactor, heat-source, oxidation-chamber, phase-heater, slag-heater
- [x] `LiquidRouter` &mdash; 6 blocs &mdash; un routeur a liquide, qui est aussi une reserve
      liquid-container, liquid-router, liquid-tank, reinforced-liquid-container, reinforced-liquid-router, reinforced-liquid-tank
- [ ] `UnitFactory` &mdash; 6 blocs &mdash; fabrique des unites : c'est ce qu'il a demande
      air-factory, ground-factory, mech-fabricator, naval-factory, ship-fabricator, tank-fabricator
- [ ] `HeatCrafter` &mdash; 5 blocs &mdash; une usine qui a besoin de chaleur en plus
      atmospheric-concentrator, carbide-crucible, cyanogen-synthesizer, phase-synthesizer, surge-crucible
- [x] `Drill` &mdash; 4 blocs &mdash; sort du sol ce qu'il y a dessous
      blast-drill, laser-drill, mechanical-drill, pneumatic-drill
- [ ] `LogicBlock` &mdash; 4 blocs &mdash; un processeur : execute un programme
      hyper-processor, logic-processor, micro-processor, world-processor
- [ ] `PowerTurret` &mdash; 4 blocs &mdash; une tourelle qui mange de l'energie
      afflict, arc, lancer, malign
- [x] `Pump` &mdash; 4 blocs &mdash; pompe le liquide sous elle
      impulse-pump, mechanical-pump, reinforced-pump, rotary-pump
- [x] `StorageBlock` &mdash; 4 blocs &mdash; un coffre : prend tout, ne pousse rien
      container, reinforced-container, reinforced-vault, vault
- [ ] `AttributeCrafter` &mdash; 3 blocs &mdash; une usine dont la vitesse depend du sol dessous
      cultivator, silicon-crucible, vent-condenser
- [ ] `HeatConductor` &mdash; 3 blocs &mdash; porte la chaleur
      heat-redirector, heat-router, small-heat-redirector
- [ ] `PowerNode` &mdash; 3 blocs &mdash; relie le reseau
      power-node, power-node-large, surge-tower
- [ ] `UnitAssembler` &mdash; 3 blocs &mdash; assemble une unite a partir de plans
      mech-assembler, ship-assembler, tank-assembler
- [ ] `ArmoredConduit` &mdash; 2 blocs
      plated-conduit, reinforced-conduit
- [x] `Battery` &mdash; 2 blocs &mdash; stocke l'energie
      battery, battery-large
- [ ] `BeamDrill` &mdash; 2 blocs
      large-plasma-bore, plasma-bore
- [ ] `BeamNode` &mdash; 2 blocs
      beam-node, beam-tower
- [ ] `BurstDrill` &mdash; 2 blocs
      eruption-drill, impact-drill
- [ ] `CanvasBlock` &mdash; 2 blocs
      canvas, large-canvas
- [x] `Conduit` &mdash; 2 blocs &mdash; un tuyau : directionnel, comme une bande
      conduit, pulse-conduit
- [ ] `Constructor` &mdash; 2 blocs
      constructor, large-constructor
- [x] `Conveyor` &mdash; 2 blocs &mdash; une bande : positions d'objets le long d'elle-meme
      conveyor, titanium-conveyor
- [ ] `Duct` &mdash; 2 blocs &mdash; les bandes d'Erekir, une seule case a la fois
      armored-duct, duct
- [ ] `LaunchPad` &mdash; 2 blocs
      advanced-launch-pad, launch-pad
- [x] `LiquidBridge` &mdash; 2 blocs &mdash; un pont a liquide
      bridge-conduit, phase-conduit
- [x] `LiquidJunction` &mdash; 2 blocs &mdash; croise deux tuyaux
      liquid-junction, reinforced-liquid-junction
- [ ] `LiquidTurret` &mdash; 2 blocs
      tsunami, wave
- [ ] `LogicDisplay` &mdash; 2 blocs
      large-logic-display, logic-display
- [ ] `MendProjector` &mdash; 2 blocs &mdash; repare, ne change aucun debit
      mend-projector, mender
- [ ] `OverdriveProjector` &mdash; 2 blocs &mdash; accelere ce qui l'entoure
      overdrive-dome, overdrive-projector
- [ ] `OverflowDuct` &mdash; 2 blocs
      overflow-duct, underflow-duct
- [x] `OverflowGate` &mdash; 2 blocs &mdash; tout droit d'abord, de cote seulement si ca bouchonne
      overflow-gate, underflow-gate
- [ ] `PayloadConveyor` &mdash; 2 blocs
      payload-conveyor, reinforced-payload-conveyor
- [ ] `PayloadDeconstructor` &mdash; 2 blocs
      deconstructor, small-deconstructor
- [ ] `PayloadMassDriver` &mdash; 2 blocs
      large-payload-mass-driver, payload-mass-driver
- [ ] `PayloadRouter` &mdash; 2 blocs
      payload-router, reinforced-payload-router
- [ ] `RepairTurret` &mdash; 2 blocs
      repair-point, repair-turret
- [x] `Router` &mdash; 2 blocs &mdash; repartit au tourniquet
      distributor, router
- [ ] `Separator` &mdash; 2 blocs &mdash; sort un objet au hasard selon des poids
      disassembler, separator
- [ ] `SolarGenerator` &mdash; 2 blocs &mdash; de l'energie, sans rien
      solar-panel, solar-panel-large
- [x] `Sorter` &mdash; 2 blocs &mdash; laisse passer ce qu'on a regle, devie le reste
      inverted-sorter, sorter
- [x] `StackConveyor` &mdash; 2 blocs &mdash; deplace une pile entiere de case en case
      plastanium-conveyor, surge-conveyor
- [ ] `SwitchBlock` &mdash; 2 blocs
      switch, world-switch
- [ ] `ThermalGenerator` &mdash; 2 blocs &mdash; de l'energie a partir du sol chaud
      thermal-generator, turbine-condenser
- [ ] `WallCrafter` &mdash; 2 blocs
      cliff-crusher, large-cliff-crusher
- [ ] `Accelerator` &mdash; 1 bloc
      interplanetary-accelerator
- [ ] `ArmoredConveyor` &mdash; 1 bloc
      armored-conveyor
- [ ] `AutoDoor` &mdash; 1 bloc
      blast-door
- [ ] `BufferedItemBridge` &mdash; 1 bloc
      bridge-conveyor
- [ ] `ColoredFloor` &mdash; 1 bloc
      colored-floor
- [ ] `ColoredWall` &mdash; 1 bloc
      colored-wall
- [ ] `ContinuousLiquidTurret` &mdash; 1 bloc
      sublimate
- [ ] `ContinuousTurret` &mdash; 1 bloc
      lustre
- [ ] `DirectionLiquidBridge` &mdash; 1 bloc
      reinforced-bridge-conduit
- [ ] `DirectionalUnloader` &mdash; 1 bloc
      duct-unloader
- [ ] `DuctBridge` &mdash; 1 bloc
      duct-bridge
- [ ] `DuctRouter` &mdash; 1 bloc
      duct-router
- [ ] `ForceProjector` &mdash; 1 bloc
      force-projector
- [ ] `Fracker` &mdash; 1 bloc
      oil-extractor
- [ ] `HeaterGenerator` &mdash; 1 bloc
      neoplasia-reactor
- [ ] `ImpactReactor` &mdash; 1 bloc &mdash; consomme et produit, avec une chauffe
      impact-reactor
- [ ] `Incinerator` &mdash; 1 bloc
      incinerator
- [ ] `ItemBridge` &mdash; 1 bloc &mdash; porte par dessus un trou, vers la case qu'il retient
      phase-conveyor
- [ ] `ItemIncinerator` &mdash; 1 bloc
      slag-incinerator
- [x] `ItemSource` &mdash; 1 bloc
      item-source
- [ ] `ItemVoid` &mdash; 1 bloc
      item-void
- [x] `Junction` &mdash; 1 bloc &mdash; quatre files, une par cote, chacune ressort en face
      junction
- [ ] `LandingPad` &mdash; 1 bloc
      landing-pad
- [ ] `LaserTurret` &mdash; 1 bloc
      meltdown
- [ ] `LegacyCommandCenter` &mdash; 1 bloc
      command-center
- [x] `LiquidSource` &mdash; 1 bloc
      liquid-source
- [ ] `LiquidVoid` &mdash; 1 bloc
      liquid-void
- [ ] `LongPowerNode` &mdash; 1 bloc
      beam-link
- [ ] `MassDriver` &mdash; 1 bloc
      mass-driver
- [ ] `NuclearReactor` &mdash; 1 bloc &mdash; de l'energie, et une explosion si on la neglige
      thorium-reactor
- [ ] `PayloadLoader` &mdash; 1 bloc
      payload-loader
- [ ] `PayloadSource` &mdash; 1 bloc
      payload-source
- [ ] `PayloadUnloader` &mdash; 1 bloc
      payload-unloader
- [ ] `PayloadVoid` &mdash; 1 bloc
      payload-void
- [ ] `PointDefenseTurret` &mdash; 1 bloc
      segment
- [ ] `PowerDiode` &mdash; 1 bloc
      diode
- [ ] `PowerSource` &mdash; 1 bloc
      power-source
- [ ] `PowerVoid` &mdash; 1 bloc
      power-void
- [ ] `RegenProjector` &mdash; 1 bloc
      regen-projector
- [ ] `RepairTower` &mdash; 1 bloc
      unit-repair-tower
- [ ] `Seaweed` &mdash; 1 bloc
      redweed
- [ ] `ShieldWall` &mdash; 1 bloc
      shielded-wall
- [ ] `ShockwaveTower` &mdash; 1 bloc
      shockwave-tower
- [ ] `SolidPump` &mdash; 1 bloc
      water-extractor
- [ ] `StackRouter` &mdash; 1 bloc
      surge-router
- [ ] `Thruster` &mdash; 1 bloc
      thruster
- [ ] `TileableLogicDisplay` &mdash; 1 bloc
      tile-logic-display
- [ ] `TractorBeamTurret` &mdash; 1 bloc
      parallax
- [ ] `UnitAssemblerModule` &mdash; 1 bloc
      basic-assembler-module
- [ ] `UnitCargoLoader` &mdash; 1 bloc
      unit-cargo-loader
- [ ] `UnitCargoUnloadPoint` &mdash; 1 bloc
      unit-cargo-unload-point
- [x] `Unloader` &mdash; 1 bloc &mdash; tire hors d'un coffre, onze par seconde
      unloader
- [ ] `VariableReactor` &mdash; 1 bloc &mdash; de l'energie proportionnelle a ce qu'on lui donne
      flux-reactor

## Posés par un joueur, mais sans effet sur ce qui circule

Un mur est un mur : il arrête des balles et ne déplace rien. Rien à
porter, et rien à mesurer non plus.

- `Wall` : 24
- `MessageBlock` : 3
- `MemoryBlock` : 3
- `Door` : 2
- `BaseShield` : 2
- `ShockMine` : 1
- `Radar` : 1
- `BuildTurret` : 1
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
