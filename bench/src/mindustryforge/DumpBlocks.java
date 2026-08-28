package mindustryforge;

import arc.struct.Seq;
import arc.util.Log;
import arc.util.serialization.Jval;
import mindustry.Vars;
import mindustry.content.TechTree;
import mindustry.content.TechTree.TechNode;
import mindustry.core.Version;
import mindustry.type.Item;
import mindustry.type.Planet;
import mindustry.type.Liquid;
import mindustry.type.ItemStack;
import mindustry.world.Block;
import mindustry.world.meta.BuildVisibility;
import mindustry.world.blocks.distribution.BufferedItemBridge;
import mindustry.world.blocks.distribution.Conveyor;
import mindustry.world.blocks.distribution.Duct;
import mindustry.world.blocks.distribution.ItemBridge;
import mindustry.world.blocks.distribution.OverflowDuct;
import mindustry.world.blocks.distribution.OverflowGate;
import mindustry.world.blocks.distribution.MassDriver;
import mindustry.world.blocks.environment.Floor;
import mindustry.world.blocks.environment.OverlayFloor;
import mindustry.world.blocks.defense.OverdriveProjector;
import mindustry.world.blocks.defense.turrets.ItemTurret;
import mindustry.world.blocks.distribution.Sorter;
import mindustry.world.blocks.distribution.StackConveyor;
import mindustry.world.blocks.storage.StorageBlock;
import mindustry.world.blocks.storage.Unloader;
import mindustry.world.blocks.units.UnitFactory;
import mindustry.world.blocks.distribution.Junction;
import mindustry.world.blocks.distribution.Router;
import mindustry.world.blocks.production.Drill;
import mindustry.world.blocks.production.Pump;
import mindustry.world.blocks.sandbox.ItemSource;
import mindustry.world.blocks.sandbox.LiquidSource;
import mindustry.world.blocks.liquid.Conduit;
import mindustry.world.blocks.liquid.LiquidBridge;
import mindustry.world.blocks.liquid.LiquidJunction;
import mindustry.world.blocks.liquid.LiquidRouter;
import mindustry.world.blocks.power.Battery;
import mindustry.world.blocks.power.ConsumeGenerator;
import mindustry.world.blocks.power.PowerGenerator;
import mindustry.world.blocks.production.ItemIncinerator;
import mindustry.world.blocks.production.Incinerator;
import mindustry.world.blocks.sandbox.LiquidVoid;
import mindustry.world.blocks.sandbox.ItemVoid;
import mindustry.world.blocks.defense.ShockwaveTower;
import mindustry.world.blocks.units.RepairTower;
import mindustry.world.blocks.units.RepairTurret;
import mindustry.world.blocks.defense.RegenProjector;
import mindustry.world.blocks.payloads.Constructor;
import mindustry.world.blocks.payloads.BlockProducer;
import mindustry.type.UnitType;
import mindustry.world.blocks.units.Reconstructor;
import mindustry.world.blocks.units.UnitAssembler;
import mindustry.world.blocks.units.UnitCargoLoader;
import mindustry.world.blocks.units.UnitCargoUnloadPoint;
import mindustry.world.blocks.units.UnitAssemblerModule;
import mindustry.world.blocks.payloads.PayloadVoid;
import mindustry.world.blocks.payloads.PayloadSource;
import mindustry.world.blocks.payloads.PayloadRouter;
import mindustry.world.blocks.payloads.PayloadConveyor;
import mindustry.world.blocks.payloads.PayloadBlock;
import mindustry.world.blocks.production.Fracker;
import mindustry.world.blocks.production.SolidPump;
import mindustry.world.meta.Attribute;
import mindustry.world.blocks.production.BurstDrill;
import mindustry.world.blocks.production.WallCrafter;
import mindustry.world.blocks.environment.StaticWall;
import mindustry.world.blocks.production.BeamDrill;
import mindustry.world.blocks.distribution.DirectionLiquidBridge;
import mindustry.world.blocks.distribution.DirectionalUnloader;
import mindustry.world.blocks.defense.Radar;
import mindustry.world.blocks.defense.ForceProjector;
import mindustry.world.blocks.defense.MendProjector;
import mindustry.world.blocks.defense.turrets.TractorBeamTurret;
import mindustry.world.blocks.defense.turrets.LiquidTurret;
import mindustry.world.blocks.defense.turrets.LaserTurret;
import mindustry.world.blocks.defense.turrets.ReloadTurret;
import mindustry.world.blocks.defense.turrets.BaseTurret;
import mindustry.world.blocks.power.BeamNode;
import mindustry.world.blocks.distribution.StackRouter;
import mindustry.world.blocks.distribution.DuctBridge;
import mindustry.world.blocks.distribution.DuctRouter;
import mindustry.world.blocks.power.VariableReactor;
import mindustry.world.blocks.power.NuclearReactor;
import mindustry.world.blocks.power.ImpactReactor;
import mindustry.world.blocks.power.ThermalGenerator;
import mindustry.world.blocks.power.HeaterGenerator;
import mindustry.world.blocks.campaign.LaunchPad;
import mindustry.world.blocks.payloads.PayloadDeconstructor;
import mindustry.world.blocks.payloads.PayloadMassDriver;
import mindustry.world.blocks.payloads.PayloadLoader;
import mindustry.world.blocks.payloads.PayloadUnloader;
import mindustry.world.blocks.defense.Door;
import mindustry.world.blocks.sandbox.PowerVoid;
import mindustry.world.blocks.power.PowerDiode;
import mindustry.world.blocks.logic.LogicBlock;
import mindustry.world.blocks.power.PowerNode;
import mindustry.world.blocks.heat.HeatConductor;
import mindustry.world.blocks.heat.HeatProducer;
import mindustry.world.blocks.production.AttributeCrafter;
import mindustry.world.blocks.production.GenericCrafter;
import mindustry.world.blocks.production.Separator;
import mindustry.world.blocks.production.HeatCrafter;
import mindustry.entities.bullet.BulletType;
import mindustry.world.consumers.Consume;
import mindustry.type.LiquidStack;
import mindustry.world.consumers.ConsumeItems;
import mindustry.world.consumers.ConsumeLiquid;
import mindustry.world.consumers.ConsumeLiquids;

import java.io.PrintWriter;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

/**
 * Write out what every block does, read from the running game.
 *
 * <p>The analyser needs a number per block: how fast a conveyor moves items, how long a
 * press takes, what a recipe consumes. Those numbers exist exactly once, inside Mindustry,
 * and every other calculator on the web has retyped them from a wiki. A retyped table is a
 * table that drifts: the game ships balance changes and the tool goes on being confidently
 * wrong, with nothing to notice it.
 *
 * <p>So nothing here is typed. The plugin loads the game's own block registry and prints
 * it, stamped with the version it came from, and the analyser refuses a table whose
 * version does not match the bench it is checked against.
 *
 * <p>Run with {@code java -jar server-release.jar} and the command
 * {@code dump-blocks <path>}. The server writes the file within a few seconds and then
 * <strong>keeps its console open for ever</strong>: it is a server, and dumping is not a
 * reason for it to stop. Piping the command in with {@code echo} therefore blocks until
 * something kills the process, long after the file is complete and correct. Wait for the
 * file, not for the exit code.
 *
 * <p>Two dumps of one unchanged game must be identical byte for byte, because that is the
 * only thing that lets a diff of this 450 kB file mean anything. Anywhere the game hands
 * over an {@link arc.struct.ObjectMap}, iterate the content registry instead: its order is
 * the content id, which is the same in every run, while a map's is the identity hash,
 * which is not.
 */
public class DumpBlocks {

    /** Ticks per second, which is what turns the game's per-tick figures into per-second. */
    private static final float TPS = 60f;

    /**
     * Pixels to a tile, which is what turns the game's ranges into tiles.
     *
     * <p><strong>Every distance in this file is written in tiles.</strong> The game is of
     * two minds about it: {@code ItemBridge.range} is a count of tiles and
     * {@code BaseTurret.range} is a float of world units, eight times larger, and for a
     * long time this dump copied each one straight through. The result was a {@code range}
     * field carrying two units with nothing to tell them apart, since a bridge's 4 and a
     * mender's 40 are both plausible either way. Every reader then had to guess from the
     * block's class, and a wrong guess is a wrong number rather than an exception.
     *
     * <p>So: divide here, once, and let no distance leave this file in world units.
     */
    private static final float TILESIZE = 8f;

    public static void dump(Path out) {
        Jval root = Jval.newObject();
        // Stamped with the build it came from, because the analyser must refuse a table
        // that does not match the bench it is checked against. A silent engine bump is
        // exactly how a calculator goes on being confidently wrong.
        root.put("game_version", Version.combined());
        root.put("build", Version.build);
        root.put("revision", Version.revision);
        root.put("colors", namedColours());

        Jval blocks = Jval.newObject();
        for (Block block : Vars.content.blocks()) {
            Jval entry = Jval.newObject();
            entry.put("name", block.name);
            // The Java class, which is what decides how a block behaves: two blocks of the
            // same class share an `updateTile` and differ only in their numbers. It is the
            // only honest way to write a list of what is left to port, because it is the
            // game's own list rather than one typed from memory.
            entry.put("kind", kindOf(block));
            /* The game's own number for this block. A schematic stores a constructor's
               recipe the way it stores a sorter's item, as a content type and an id, and
               turning that back into a name needs the registry rather than a guess. */
            entry.put("id", block.id);
            entry.put("size", block.size);
            entry.put("item_capacity", block.itemCapacity);
            // How much a block can hold, which a steady-state calculation never needed and
            // a simulation cannot do without: a tank that fills is a tank that stops
            // taking, and that is the whole reason a line backs up.
            entry.put("liquid_capacity", block.liquidCapacity);
            entry.put("has_items", block.hasItems);
            /* Whether an unloader may take out of it. True for nearly everything, and
               false for every carrier: a duct, a router, an unloader itself. Without it an
               Erekir unloader happily drains the duct behind it. */
            if (block.unloadable) entry.put("unloadable", true);
            /* Whether it has a tank at all. Every block reports a `liquidCapacity`, which
               defaults to ten, so a power node reads as something that can hold water: a
               liquid source beside one filled it, and the schematic showed a puddle in a
               wire. `hasLiquids` is the flag the game itself tests. */
            entry.put("has_liquids", block.hasLiquids);
            entry.put("has_power", block.hasPower);
            /* Les trois drapeaux qui decident si deux blocs voisins partagent une grille.
               Le jeu refuse la liaison quand les **deux** consomment, qu'**aucun** ne
               produit, et qu'aucun n'est conducteur : le courant ne traverse pas un
               consommateur. Trois blocs seulement sont conducteurs, et sans eux une rangee
               de machines collees les unes aux autres se retrouve entierement alimentee
               par le seul generateur du bout. */
            if (block.consumesPower) entry.put("consumes_power", true);
            if (block.outputsPower) entry.put("outputs_power_flag", true);
            if (block.conductivePower) entry.put("conductive_power", true);
            /* Un noeud a faisceau saute par-dessus un power node sans s y accrocher
               et continue son balayage. `LongPowerNode` et `PowerSource` en heritent
               tous les deux, donc comparer le nom de la classe laissait le faisceau
               s arreter dessus et la foreuse derriere seule sur sa grille. */
            if (block instanceof PowerNode) entry.put("power_node", true);
            entry.put("rotate", block.rotate);
            /* Ou ranger le bloc dans la palette, et avec quoi il est interchangeable.

               `Block.canReplace` lit `group`, `subclass`, `replaceable`, `alwaysReplace`,
               `privileged` et `quickRotate`. Un editeur qui n en connait qu une partie
               refuse des gestes que le jeu accepte, et poser un convoyeur titane sur un
               convoyeur redevient impossible. Deviner depuis `role` ne marche pas : `role`
               regroupe des blocs que le jeu separe, et separe des blocs qu il regroupe. */
            entry.put("category", block.category.name());
            entry.put("group", block.group.name());
            if (block.group.anyReplace) entry.put("group_any_replace", true);
            if (block.subclass != null) entry.put("subclass", block.subclass.getSimpleName());
            /* Le drapeau qui autorise le trace par recherche de chemin plutot que par
               escalier, quand le placement diagonal est demande. Les bandes, les conduits
               et les gaines l ont ; un routeur ne l a pas. */
            if (block.conveyorPlacement) entry.put("conveyor_placement", true);
            /* Comment un glisse trace, lu dans `InputHandler.iterateLine`. Le defaut est une
               ligne droite sur l axe dominant ; la touche « placement diagonal » bascule
               vers un escalier ou un A*, et quelques blocs inversent ce basculement pour que
               leur comportement le plus utile soit celui qu on obtient sans toucher a rien. */
            if (!block.allowDiagonal) entry.put("allow_diagonal", false);
            if (block.swapDiagonalPlacement) entry.put("swap_diagonal_placement", true);
            if (block.allowRectanglePlacement) entry.put("allow_rectangle_placement", true);
            /* Les deux blocs qu un convoyeur devient tout seul quand la ligne le demande.

               `junctionReplacement` : tracer a travers une ligne perpendiculaire pose une
               jonction au croisement, au lieu de couper la ligne d en dessous.
               `bridgeReplacement` : rencontrer un obstacle le fait sauter par un pont.

               Ce sont les deux mecaniques qui font qu on trace a travers son usine sans y
               penser, et elles ne se devinent pas : le jeu nomme explicitement le bloc de
               remplacement, bande par bande. */
            if (block instanceof Conveyor conveyor) {
                if (conveyor.junctionReplacement != null) {
                    entry.put("junction_replacement", conveyor.junctionReplacement.name);
                }
                if (conveyor.bridgeReplacement != null) {
                    entry.put("bridge_replacement", conveyor.bridgeReplacement.name);
                }
            }
            if (block instanceof Duct duct) {
                if (duct.bridgeReplacement != null) {
                    entry.put("bridge_replacement", duct.bridgeReplacement.name);
                }
            }
            /* Le reste de ce que la pose lit, et que rien ne remplace. `lockRotation` force
               la rotation a zero, `ignoreLineRotation` empeche un bloc de suivre le sens du
               glisse, `invertFlip` inverse le miroir d un schema. */
            if (block.ignoreLineRotation) entry.put("ignore_line_rotation", true);
            if (block.lockRotation) entry.put("lock_rotation", true);
            if (block.invertFlip) entry.put("invert_flip", true);
            if (block.saveConfig) entry.put("save_config", true);
            if (block.copyConfig) entry.put("copy_config", true);
            if (block.configurable) entry.put("configurable", true);
            if (block.clearOnDoubleTap) entry.put("clear_on_double_tap", true);
            if (!block.placeablePlayer) entry.put("placeable_player", false);
            /* `breakable` n est pas dumpe, et c est un choix.

               Le champ est declare sans valeur dans `Block` et n y est assigne nulle part :
               il vaut donc `false` par defaut, et au moment ou le dump tourne il vaut faux
               pour absolument tout, convoyeur compris. Le sortir tel quel donnerait un
               editeur ou plus rien ne se casse. Ce qui est reellement intouchable porte
               `privileged`, qui lui est fiable, et c est ce que les regles lisent. */
            if (block.schematicPriority != 0) entry.put("schematic_priority", block.schematicPriority);
            /* Ce que le menu de construction du jeu montre. Un bloc cache, reserve au bac a
               sable ou a l editeur n a rien a faire dans une palette de joueur : c est ce
               tri la qui remplace le « il a un cout de construction » que Forge utilisait,
               et qui laissait passer des blocs que personne ne peut poser. */
            entry.put("build_visibility", visibilityName(block.buildVisibility));
            if (!block.replaceable) entry.put("replaceable", false);
            if (block.alwaysReplace) entry.put("always_replace", true);
            if (block.quickRotate) entry.put("quick_rotate", true);
            if (block.privileged) entry.put("privileged", true);
            /* Ce que le sol sous un bloc autorise, lu dans `Build.validPlace`. Un liquide
               profond ne porte que ce qui flotte, une thermogeneratrice exige son eau, et
               quelques blocs se posent sur du liquide alors que rien d autre ne le peut. */
            if (!block.placeableOn) entry.put("placeable_on", false);
            if (block.requiresWater) entry.put("requires_water", true);
            if (block.placeableLiquid) entry.put("placeable_liquid", true);
            // Frames between two attempts to hand an output on. It rarely binds - a press
            // makes one graphite every ninety frames and may offload every five - but it
            // is the difference between a machine that trickles and one that bursts.
            entry.put("dump_time", block.dumpTime);

            /* Exactly which items and liquids a block will take, read off the filters the
               game builds when its consumers are declared.
            
               Inferred from the recipe instead, a generator that burns "anything" accepted
               anything at all: a drill beside one fed it copper, the generator burned it,
               and twenty two items out of forty eight vanished on the way to the vault.
               The game's answer is `ConsumeItemFlammable`, which writes a filter, and the
               filter is a fact rather than a guess. */
            Jval accepts = Jval.newArray();
            for (Item item : Vars.content.items()) {
                if (block.itemFilter != null && block.itemFilter.length > item.id
                        && block.itemFilter[item.id]) {
                    accepts.asArray().add(Jval.valueOf(item.name));
                }
            }
            if (accepts.asArray().size > 0) entry.put("accepts", accepts);

            Jval drinks = Jval.newArray();
            for (Liquid liquid : Vars.content.liquids()) {
                if (block.liquidFilter != null && block.liquidFilter.length > liquid.id
                        && block.liquidFilter[liquid.id]) {
                    drinks.asArray().add(Jval.valueOf(liquid.name));
                }
            }
            if (drinks.asArray().size > 0) entry.put("drinks", drinks);
            // How hard a block pushes a liquid at the next one. `moveLiquid` compares the
            // fraction it holds, times this, against the fraction the other holds, so a
            // settled line has a gradient along it rather than a flat rate.
            entry.put("liquid_pressure", block.liquidPressure);
            /* Whether a router will wait before handing to it. Two blocks set it, a sorter
               and an overflow gate, and it is the difference between a router chain at
               eleven items a second and at seven and a half. */
            if (block.instantTransfer) entry.put("instant_transfer", true);
            /* How fast cargo slides into place and turns. Both are on `PayloadBlock` and
               neither is ever redefined: 0.7 pixels and 5 degrees a frame. A payload spends
               real time arriving, and a reconstructor does not start on the frame the
               conveyor hands it over. */
            if (block instanceof PayloadBlock payload) {
                entry.put("payload_speed", payload.payloadSpeed);
                entry.put("payload_rotate_speed", payload.payloadRotateSpeed);
            }
            if (block.outputsPayload) entry.put("outputs_payload", true);
            if (block.acceptsPayload) entry.put("accepts_payload", true);
            /* Si on peut poser une cargaison sur la case : `canDump` vaut
               `front == null || !front.tile.solid()`, et `Tile.solid()` est
               `block.solid || floor.solid || build.checkSolid()`. Un convoyeur, un duct,
               une conduite ou un routeur ne sont pas solides, donc une usine pointee vers
               un tapis pose son unite au sol et repart. Le portage prenait la seule
               presence d'un batiment pour un mur et s'arretait apres une unite.

               Une porte confie tout a `checkSolid()` et laisse `block.solid` a faux : lue
               sur le seul champ, une porte **fermee**, qui est son etat par defaut, ne
               bloquait rien du tout. */
            if (block.solid || block instanceof Door) entry.put("solid", true);
            /* Whether a pipe pointed at nothing spills. The class sets it one way and the
               block the other: `ArmoredConduit` declares `leaks = false` and
               `reinforced-conduit` turns it back on, so reading the class gets it wrong
               for the only two blocks it applies to. */
            if (block instanceof Conduit pipe && pipe.leaks) entry.put("leaks", true);
            // What a battery holds. A buffered consumer asks for nothing and stores a lot,
            // which is exactly what tells a battery apart from a machine.
            if (block.consPower != null && block.consPower.buffered) {
                entry.put("power_capacity", block.consPower.capacity);
            }
            entry.put("health", block.health);
            /* De quoi mourir, et emporter les voisins. Un bloc qui saute rend au souffle son
               explosivite de base plus ce qu'il tenait, et un reacteur au thorium y ajoute
               un second souffle qui lui est propre. */
            if (block.baseExplosiveness != 0f) {
                entry.put("base_explosiveness", block.baseExplosiveness);
            }
            if (block.explosivenessScale != 1f) {
                entry.put("explosiveness_scale", block.explosivenessScale);
            }
            if (block instanceof mindustry.world.blocks.power.NuclearReactor pile) {
                entry.put("explosion_radius", pile.explosionRadius);
                entry.put("explosion_damage", pile.explosionDamage);
            }
            /* How long this block takes to build, which is not a field anyone typed: it is
               derived from the requirements in `Block.init` as the sum of amount times item
               cost. A constructor's whole clock is the build time of whatever it was set
               to, so it has to be carried for every block and not only for the buildable
               ones. */
            /* De quoi dessiner un bloc **en marche**, et pas seulement au repos.
               Les couches animees ne se devinent pas au nom du fichier : `-glow` est
               tantot une lueur rouge de four, tantot une lueur bleue d electrolyseur, et
               la couleur vit dans le `DrawBlock` du bloc et nulle part ailleurs. Devinee,
               elle est fausse la moitie du temps ; dumpee, elle est celle du jeu. */
            Jval painted = drawersOf(block);
            if (painted.asArray().size > 0) {
                entry.put("drawers", painted);
                /* La vitesse a laquelle une usine monte en regime. Elle ne change aucun
                   debit - `getProgressIncrease` lit `edelta`, pas `warmup` - et elle est
                   toute la difference entre une lueur qui s allume et une lueur qui claque
                   d une image a l autre. */
                if (block instanceof mindustry.world.blocks.production.GenericCrafter oven) {
                    entry.put("warmup_speed", oven.warmupSpeed);
                }
            }
            entry.put("build_time", block.buildTime);
            /* Whether a beam stops at it. Only insulation stops one: a titanium wall does
               not, which is contrary to every instinct and is the game's rule. */
            if (block.insulated) entry.put("insulated", true);
            /* Un bloc qui ne se met jamais a jour n est pas dans la liste du jeu,
               donc il ne compte pas dans les places : un coffre entre deux tapis
               decalait tout l ordre du portage d un cran. */
            if (!block.update) entry.put("no_update", true);
            /* Un noeud pose sans lien enregistre se relie tout seul a ce qui passe a
               portee : `placed()` appelle `getPotentialLinks` des que `power.links`
               est vide. Sans ces trois champs, un schema dont les liens n ont pas ete
               copies laissait chaque bloc seul sur sa grille. */
            if (block instanceof PowerNode node) {
                entry.put("laser_range", node.laserRange);
                entry.put("max_nodes", node.maxNodes);
                if (!node.autolink) entry.put("no_autolink", true);
                /* Un beam-link ne se relie qu a un autre beam-link : cinq cents
                   cases de portee et personne d autre au bout. */
                if (node.sameBlockConnection) entry.put("same_block_link", true);
            }
            // Vrai par defaut : ce qui le met a faux ne rejoint aucune grille.
            if (!block.connectedPower) entry.put("no_connected_power", true);

            // What it costs to build, which is what "compact" and "cheap" are scored on.
            Jval cost = Jval.newObject();
            for (ItemStack stack : block.requirements) {
                cost.put(stack.item.name, stack.amount);
            }
            entry.put("cost", cost);

            // Power, read the way the game reads it for its own schematic panel:
            // `Schematic.powerConsumption` sums `consPower.usage` and `powerProduction`
            // sums `getDisplayedPowerProduction()`, both per tick. Taken here for every
            // block rather than per role, because a phase conveyor draws power and is not
            // a power block: filed under bridges, its 0.3 a tick went uncounted and a 334
            // block layout came out 144 energy a second cheaper than the game says.
            // Guarded, because the sandbox power void declares an infinite draw and
            // `Infinity` is not JSON: the dump it produced could not be parsed at all by
            // anything stricter than Python.
            float draw = block.consPower != null ? block.consPower.usage * TPS : 0f;
            entry.put("power", Float.isFinite(draw) ? draw : 0f);
            if (!Float.isFinite(draw)) entry.put("power_void", true);
            // An overdrive projector speeds up what stands near it, and the game's own
            // schematic panel ignores that entirely: forty thorium reactors under five
            // projectors read as 36,900 energy a second when they make 55,350. Two flags
            // decide who is sped up, and both are the game's, read rather than guessed.
            if (!block.canOverdrive) entry.put("no_overdrive", true);
            if (block.privileged) entry.put("privileged", true);
            if (block instanceof PowerGenerator generator) {
                // Not `powerProduction`: a thermal generator divides by its display scale,
                // and the game's own figure is the divided one.
                entry.put("power_out", generator.getDisplayedPowerProduction() * TPS);
                /* And the undivided one beside it, because the simulation needs the field
                   and the reader needs the figure. A turbine condenser reads three power a
                   tick on its own card and holds 1/3, the difference being the nine tiles
                   of vent it is standing on: dividing once for the player and once for the
                   engine would be dividing twice. */
                entry.put("power_production", generator.powerProduction * TPS);
            }

            /* La portee d un pylone, en tuiles. Elle vit dans `laserRange` et non dans
               `range`, qui reste vide pour eux : sans elle, un glisse de pylones ne sait pas
               a quel espacement les poser pour qu ils se voient encore. */
            if (block instanceof PowerNode node) entry.put("laser_range", node.laserRange);

            /* How fast a processor runs, which is the whole of what separates the three of
               them: a micro does two instructions a tick, a logic eight, a hyper
               twenty-five. Nothing else about a processor is a number, so without this the
               catalogue had nothing to say about them at all.

               `maxInstructionScale` is the second half of the answer and the half that
               surprises. The processor accumulates `edelta * instructionsPerTick` and
               spends one per instruction, and that accumulator is capped at
               `maxInstructionScale * instructionsPerTick`: a processor that falls behind
               catches up, but only by that many ticks' worth, and past it the work is lost
               rather than deferred. A program timed on the per-tick figure alone is timed
               on the best case.

               `maxInstructionsPerTick` is the ceiling a world processor may be configured
               up to, and applies to no block a player can build. Carried because a field
               that exists and is not carried is a field somebody re-derives from a wiki.

               Read from the v159.7 bytecode of `LogicBuild.updateTile`, not from memory. */
            if (block instanceof LogicBlock processor) {
                entry.put("instructions_per_tick", processor.instructionsPerTick);
                entry.put("max_instruction_scale", processor.maxInstructionScale);
                entry.put("max_instructions_per_tick", processor.maxInstructionsPerTick);
                /* In tiles, like every other distance here: the game holds it in world
                   units, so a micro's is `8f * 10` and reads as 80.

                   Skipped for a world processor, whose range is `Float.MAX_VALUE` because
                   it reaches everything. Divided, that is 4.25e37, and a number that large
                   is a lie rather than a measurement: it would be drawn, compared and
                   formatted as though it meant something. An absent field says "no limit"
                   more honestly than any figure could. */
                if (!block.privileged) entry.put("logic_range", processor.range / TILESIZE);
            }

            describeRole(block, entry);
            describeFloor(block, entry);
            blocks.put(block.name, entry);
        }

        /* De quelle planete vient un bloc, pour qu une palette puisse ne montrer qu un des
           deux jeux de blocs. Serpulo et Erekir ne partagent presque rien, et les melanger
           dans une meme grille donne les 253 pastilles indifferenciees d aujourd hui.

           Le champ `planet` d un noeud vaut null presque partout, y compris sur les
           racines : lire `TechTree.all` en retombant sur Serpulo quand il est null met
           Erekir entier sur Serpulo, ce qui est exactement le contraire du but. Mesure
           faite, les 241 blocs des deux arbres ressortaient tous serpuliens, `core-bastion`
           compris.

           L association fiable est dans l autre sens : `Planet.techTree` porte la racine de
           l arbre de sa planete. On descend donc depuis chaque planete, ce qui donne la
           reponse sans dependre d un champ que le jeu ne remplit pas.

           Un bloc qui n est dans aucun arbre, comme les sols et les blocs de bac a sable,
           ne recoit pas de planete du tout. */
        for (Planet planet : Vars.content.planets()) {
            if (planet.techTree != null) stampPlanet(planet.techTree, planet.name, blocks);
        }
        root.put("blocks", blocks);

        Jval items = Jval.newObject();
        for (Item item : Vars.content.items()) {
            Jval entry = Jval.newObject();
            entry.put("name", item.name);
            // Hardness is what decides which drill can touch an ore, and cost is the
            // game's own notion of how precious an item is. Both are needed to say what a
            // layout is worth rather than only how much it moves.
            // The id, because a schematic stores a sorter's filter and a source's output as
            // a content type and a number, and turning that back into "titanium" needs the
            // game's own numbering rather than the order a JSON object happens to be in.
            entry.put("id", item.id);
            // The colour the game paints a sorter and a source with. Without it those
            // blocks draw as blank frames, and telling twelve identical sources apart is
            // exactly what the colour is for.
            entry.put("color", "#" + item.color.toString().substring(0, 6));
            entry.put("hardness", item.hardness);
            entry.put("cost", item.cost);
            entry.put("explosiveness", item.explosiveness);
            entry.put("flammability", item.flammability);
            /* What a generator's output is multiplied by. `ConsumeItemFlammable` hands
               back the flammability of what it drew, `ConsumeItemRadioactive` the
               radioactivity: a combustion generator makes 1.0 on coal and 1.4 on pyratite,
               an RTG 1.0 on thorium and 0.6 on phase fabric. */
            entry.put("radioactivity", item.radioactivity);
            entry.put("charge", item.charge);
            items.put(item.name, entry);
        }
        root.put("items", items);

        // Which names are liquids, stated rather than inferred. It had been worked out
        // from whatever appeared in a recipe, which is right until a schematic configures
        // a source with a liquid no block in it consumes.
        Jval liquids = Jval.newObject();
        for (Liquid liquid : Vars.content.liquids()) {
            Jval entry = Jval.newObject();
            entry.put("id", liquid.id);
            entry.put("color", "#" + liquid.color.toString().substring(0, 6));
            entry.put("heat_capacity", liquid.heatCapacity);
            // Whether an incinerator will take it. Water will not burn.
            if (liquid.incinerable) entry.put("incinerable", true);
            entry.put("temperature", liquid.temperature);
            /* Ce qu'un plein de ce liquide ajoute au souffle quand le bloc qui le tenait
               saute. Un reservoir d'huile ne fait pas le meme trou qu'un reservoir d'eau. */
            entry.put("explosiveness", liquid.explosiveness);
            entry.put("flammability", liquid.flammability);
            liquids.put(liquid.name, entry);
        }
        root.put("liquids", liquids);

        // The units, so a factory's plan can be read back out of a schematic: the
        // configuration stores a content type and an id, and an id means nothing without
        // the registry it came from.
        Jval units = Jval.newObject();
        for (mindustry.type.UnitType unit : Vars.content.units()) {
            Jval entry = Jval.newObject();
            entry.put("id", unit.id);
            entry.put("health", unit.health);
            /* Ce qu'il faut pour faire voler un drone jusqu'a sa place autour d'un
               assembleur : la vitesse, l'acceleration, la trainee et la vitesse de rotation.
               Un assembleur n'avance que de la fraction de ses drones **en position**, donc
               son debit est une question de vol avant d'etre une question de recette. */
            entry.put("speed", unit.speed);
            entry.put("accel", unit.accel);
            entry.put("drag", unit.drag);
            entry.put("rotate_speed", unit.rotateSpeed);
            entry.put("hit_size", unit.hitSize);
            entry.put("item_capacity", unit.itemCapacity);
            units.put(unit.name, entry);
        }
        root.put("units", units);

        try {
            Files.createDirectories(out.getParent());
            try (PrintWriter writer = new PrintWriter(
                    Files.newBufferedWriter(out, StandardCharsets.UTF_8))) {
                writer.print(root.toString(Jval.Jformat.formatted));
            }
            Log.info("[forge] wrote @ blocks and @ items to @",
                    Vars.content.blocks().size, Vars.content.items().size, out);
        } catch (Exception error) {
            Log.err("[forge] could not write block data", error);
        }
    }

    /**
     * The part that differs per kind of block, and the only part the flow model cares about.
     *
     * <p>Read off the concrete classes rather than off names. A block called "conveyor" is
     * a guess; a block that is an instance of {@link Conveyor} is a fact, and it keeps
     * working for the blocks a mod adds.
     */
    private static void describeRole(Block block, Jval entry) {
        if (block instanceof StackConveyor stack) {
            // Not a `Conveyor`: it moves a whole stack from tile to tile rather than items
            // along a length, so it shares no ancestor with one and fell through every
            // branch below. It came out classified as a sink, which made every plastanium
            // conveyor in every schematic a hole that swallowed whatever reached it.
            entry.put("role", "stack-conveyor");
            entry.put("carries", "item");
            entry.put("items_per_second", Math.round(block.itemCapacity * stack.speed * TPS));
            entry.put("speed", stack.speed);
            entry.put("recharge", stack.recharge);
            entry.put("output_router", stack.outputRouter);
            return;
        }
        if (block instanceof Conveyor conveyor) {
            entry.put("role", "conveyor");
            entry.put("carries", "item");
            // displayedSpeed is items per second at full compression, which is the figure
            // the game shows the player and the only one worth comparing tools on.
            entry.put("items_per_second", conveyor.displayedSpeed);
            // How far along a belt an item slides in one frame. `displayedSpeed` is a
            // figure typed by hand for the player, block by block; it is not `speed` times
            // anything, so a simulation that needs the real one has to be given it.
            entry.put("speed", conveyor.speed);
            return;
        }
        if (block instanceof Junction junction) {
            entry.put("role", "junction");
            entry.put("carries", "item");
            /* `60 / speed * capacity`, and not `60 / speed`.

               A junction is four queues of `capacity` items, each item spending `speed`
               frames inside: the throughput is the queue length over the transit time. The
               game states thirteen for itself and its own comment works the real figure out
               at `60/26*6 = 13.84`. Written as `60 / speed` it came to 2.31, so any line
               crossing a junction was capped at a fifth of a copper belt and the junction
               became the bottleneck of every layout containing one. */
            entry.put("items_per_second",
                TPS / Math.max(1f, junction.speed) * junction.capacity);
            // Frames an item spends crossing, and how many may be crossing at once, per
            // side. A junction is four queues, not a buffer.
            entry.put("junction_speed", junction.speed);
            entry.put("junction_capacity", junction.capacity);
            return;
        }
        if (block instanceof OverflowDuct overflowDuct) {
            // A duct that goes straight on when it can and to the sides when it cannot.
            // Same shape as an overflow gate, on Erekir's carrier instead of Serpulo's.
            entry.put("role", "duct");
            entry.put("carries", "item");
            entry.put("items_per_second", TPS / Math.max(1f, overflowDuct.speed));
            entry.put("duct_speed", overflowDuct.speed);
            entry.put("overflow", true);
            if (overflowDuct.invert) entry.put("invert", true);
            return;
        }
        /* Three Erekir carriers that do not extend anything the reader recognised, so all
           three fell through to "sink" and swallowed whatever was handed to them. A duct
           router is not a `Router`, a duct bridge is not an `ItemBridge`, and a surge
           router is a duct router with a stack. An Erekir schematic built on any of them
           read as a line that produced nothing. */
        /* The payload family, all of it filed as sinks or as nothing at all.

           A payload is a unit or a block being carried around as cargo, and none of it was
           reproduced: a reconstructor read as a hole that swallowed whatever a conveyor
           handed it, and its silicon and its power were counted as consumed by nobody. */
        if (block instanceof PayloadConveyor carrier) {
            entry.put("role", block instanceof PayloadRouter ? "payload-router"
                                                             : "payload-conveyor");
            entry.put("carries", "payload");
            /* Frames per step, and the step is on the **global** clock rather than on a
               counter per block: `curStep = (int)(Time.time / moveTime)`. Every payload
               conveyor on a map moves on the same frame. */
            entry.put("move_time", carrier.moveTime);
            entry.put("payload_limit", carrier.payloadLimit);
            return;
        }
        if (block instanceof BlockProducer maker) {
            /* A constructor: items in, a **block** out as cargo. Its recipe is its
               configuration, so its ingredients and its clock both change with what a
               player set it to, and neither can be written down here. */
            entry.put("role", "constructor");
            entry.put("carries", "payload");
            entry.put("build_speed", maker.buildSpeed);
            /* And what it is allowed to be set to. A constructor is not a general purpose
               factory: it carries a list of seven blocks, and a configuration outside that
               list is silently refused. Set to something it will not make, it reports no
               recipe, `shouldConsume` is false, and it sits at zero looking healthy. */
            if (block instanceof Constructor picky && !picky.filter.isEmpty()) {
                Jval allowed = Jval.newArray();
                for (Block one : picky.filter) allowed.asArray().add(Jval.valueOf(one.name));
                entry.put("produces", allowed);
            }
            return;
        }
        if (block instanceof PayloadSource) {
            entry.put("role", "payload-source");
            entry.put("carries", "payload");
            return;
        }
        if (block instanceof PayloadVoid) {
            entry.put("role", "payload-void");
            entry.put("carries", "payload");
            return;
        }
        if (block instanceof Reconstructor rebuilder) {
            entry.put("role", "reconstructor");
            entry.put("carries", "payload");
            entry.put("construct_time", rebuilder.constructTime);
            /* Which unit becomes which, in order: `upgrade()` takes the first match. */
            Jval upgrades = Jval.newArray();
            for (UnitType[] pair : rebuilder.upgrades) {
                Jval one = Jval.newObject();
                one.put("from", pair[0].name);
                one.put("to", pair[1].name);
                upgrades.asArray().add(one);
            }
            entry.put("upgrades", upgrades);
            /* The cap is **per item** and not the block's own `itemCapacity`: an
               exponential reconstructor takes 1700 silicon, 1500 titanium and 1300
               plastanium, and `itemCapacity` is the largest of the three. Reading one
               number for all of them overfills two ingredients out of three. */
            Jval capacities = Jval.newObject();
            for (Item item : Vars.content.items()) {
                int found = rebuilder.capacities[item.id];
                if (found > 0) capacities.put(item.name, found);
            }
            entry.put("capacities", capacities);
            entry.put("input", inputsOf(block));
            entry.put("input_liquid", liquidInputsOf(block));
            return;
        }
        if (block instanceof BeamDrill bore) {
            /* Erekir's drill, which does not stand on its ore: it points at a cliff and
               eats sideways into it, one item per tile of its own width that has a wall
               within range. Filed as a sink, every plasma bore in a schematic was a hole
               rather than a source. */
            entry.put("role", "beam-drill");
            entry.put("carries", "item");
            entry.put("drill_time", bore.drillTime);
            entry.put("range", bore.range);
            entry.put("tier", bore.tier);
            entry.put("optional_boost_intensity", bore.optionalBoostIntensity);
            entry.put("drill_multipliers", drillMultipliersOf(bore.drillMultipliers));
            if (bore.blockedItems != null) {
                Jval blocked = Jval.newArray();
                for (Item item : bore.blockedItems) blocked.asArray().add(Jval.valueOf(item.name));
                entry.put("blocked_items", blocked);
            }
            entry.put("input_liquid", liquidInputsOf(block));
            /* The liquid that makes it faster and that it runs without: hydrogen, worth
               two and a half times the speed. Kept apart from the ingredient list, because
               a bore with no hydrogen is a slow bore and not a stopped one. */
            Jval boost = Jval.newObject();
            for (Consume consume : block.consumers) {
                if (consume.booster && consume instanceof ConsumeLiquid one) {
                    boost.put(one.liquid.name, one.amount * TPS);
                }
            }
            if (boost.asObject().size > 0) entry.put("boost_liquid", boost);
            return;
        }
        if (block instanceof DirectionalUnloader puller) {
            /* Erekir's unloader: it does not push round, it takes from the block behind it
               and hands to the block in front, one item every `speed` frames. Filed as a
               sink it was a hole in the middle of every Erekir bus. */
            entry.put("role", "duct-unloader");
            entry.put("carries", "item");
            entry.put("speed", puller.speed);
            entry.put("items_per_second", TPS / Math.max(0.0001f, puller.speed));
            if (puller.allowCoreUnload) entry.put("allow_core_unload", true);
            return;
        }
        if (block instanceof DirectionLiquidBridge span) {
            entry.put("role", "liquid-span");
            entry.put("carries", "liquid");
            entry.put("range", span.range);
            return;
        }
        if (block instanceof StackRouter stack) {
            // Checked before `DuctRouter`, which it extends.
            entry.put("role", "stack-router");
            entry.put("carries", "item");
            entry.put("duct_speed", stack.speed);
            // It runs without power, at a seventh of the speed: `efficiency + 1`, and the
            // one is the part that does not come off the grid.
            entry.put("base_efficiency", stack.baseEfficiency);
            entry.put("items_per_second", TPS / Math.max(1f, stack.speed) * block.itemCapacity);
            return;
        }
        if (block instanceof DuctRouter router) {
            entry.put("role", "duct-router");
            entry.put("carries", "item");
            entry.put("duct_speed", router.speed);
            entry.put("items_per_second", TPS / Math.max(1f, router.speed));
            return;
        }
        if (block instanceof DuctBridge span) {
            entry.put("role", "duct-bridge");
            entry.put("carries", "item");
            entry.put("duct_speed", span.speed);
            entry.put("range", span.range);
            entry.put("items_per_second", TPS / Math.max(1f, span.speed));
            return;
        }
        if (block instanceof Duct duct) {
            // Erekir's carrier. Not a conveyor: it holds exactly one item at a time and
              // carries it across in `speed` frames, so its rate falls out of that rather
              // than out of spacing.
            entry.put("carries", "item");
            /* `60 / speed`, which is `Duct.setStats`. The doubling that used to be here
               came from reading `progress += edelta() / speed * 2` as "two steps a frame
               so twice the rate", but the threshold moves with `speed` as well: an item
               takes `ceil(speed - 0.5)` updates to cross, which is `speed`. */
            entry.put("items_per_second", TPS / Math.max(1f, duct.speed));
            // Frames to carry one item across, which is what the simulation needs: a duct
            // holds exactly one thing at a time and its rate falls out of that.
            entry.put("duct_speed", duct.speed);
            if (duct.armored) entry.put("armored", true);
            entry.put("role", "duct");
            return;
        }
        if (block instanceof ItemBridge bridge && !(block instanceof LiquidBridge)) {
            // A bridge carries items over a gap to a tile it remembers, so it is a carrier
            // and not a sink. Classified as a sink it swallowed everything handed to it:
            // ten of them in the first real schematic, and the whole line downstream read
            // as producing nothing.
            entry.put("role", "bridge");
            entry.put("carries", "item");
            entry.put("range", bridge.range);
            entry.put("items_per_second", TPS / Math.max(1f, bridge.transportTime));
            entry.put("transport_time", bridge.transportTime);
            if (block instanceof BufferedItemBridge buffered) {
                // Not a hand-off but a delay line: an item entering spends `speed` frames
                // inside before it may leave, and the far end may only take one every four
                // frames. Modelled as a plain timer, a bridge line ran five per cent fast.
                entry.put("buffered", true);
                entry.put("buffer_speed", buffered.speed);
                entry.put("buffer_capacity", buffered.bufferCapacity);
            }
            return;
        }
        if (block instanceof MassDriver driver) {
            /* Sans branche a lui, le mass driver tombait dans le repli `sink` : aucun
               `ConsumeItems`, donc ni `accepts` ni `input` dans le catalogue, donc
               `wants()` repondait non a tout et une paire de drivers relies transportait
               zero objet par seconde. */
            entry.put("role", "mass-driver");
            entry.put("carries", "item");
            entry.put("range", driver.range / TILESIZE);
            entry.put("rotate_speed", driver.rotateSpeed);
            entry.put("min_distribute", driver.minDistribute);
            entry.put("reload", driver.reload);
            entry.put("bullet_speed", driver.bulletSpeed);
            entry.put("bullet_lifetime", driver.bulletLifetime);
            entry.put("translation", driver.translation);
            /* Le debit annonce dans la fiche du jeu : une salve de `itemCapacity` toutes
               les `reload` images, plafonnee par ce que le recepteur peut ecouler. */
            entry.put("items_per_second", driver.itemCapacity * (TPS / driver.reload));
            return;
        }
        if (block instanceof OverflowGate gate) {
            // Straight on when it can, to the sides when it cannot. A maximum flow cannot
            // express that priority and reads it as a plain router, which is right on the
            // total and wrong on which branch carries it. A simulation can, so the flag
            // travels even though the analytic side ignores it.
            entry.put("role", "router");
            entry.put("carries", "item");
            entry.put("overflow", true);
            if (gate.invert) entry.put("invert", true);
            entry.put("overflow_speed", gate.speed);
            return;
        }
        if (block instanceof Sorter) {
            entry.put("role", "sorter");
            entry.put("carries", "item");
            return;
        }
        if (block instanceof Router plain) {
            entry.put("role", "router");
            /* Eight frames to hand on, and only towards another router or a block that
               transfers instantly. Towards a belt or a machine it lets go the same frame.
               Without it a chain of routers carries eleven items a second where the game
               carries seven and a half. */
            entry.put("speed", plain.speed);
            entry.put("carries", "item");
            return;
        }
        if (block instanceof WallCrafter crusher) {
            /* A cliff crusher, which is a drill that eats the **cliff** rather than the
               ground: its speed is the sand attribute of whatever solid block is against
               each tile of its face. It matched no branch at all before this, so it read
               as an unknown block. */
            entry.put("role", "wall-crafter");
            entry.put("carries", "item");
            entry.put("drill_time", crusher.drillTime);
            entry.put("attribute", crusher.attribute.name);
            if (crusher.output != null) {
                Jval out = Jval.newObject();
                out.put(crusher.output.name, 1);
                entry.put("output", out);
            }
            entry.put("liquid_boost", crusher.liquidBoostIntensity);
            entry.put("item_boost", crusher.itemBoostIntensity);
            entry.put("boost_time", crusher.boostItemUseTime);
            entry.put("boost_input", optionalInputsOf(block));
            entry.put("boost_liquid", boostLiquidsOf(block));
            return;
        }
        if (block instanceof BurstDrill burst) {
            entry.put("drill_multipliers", drillMultipliersOf(burst.drillMultipliers));
            entry.put("blocked_items", blockedItemsOf(burst));
            /* A burst drill, which is a `Drill` with a different clock: its progress does
               not scale with how many ore tiles it covers, only its **batch** does. Nine
               tiles of ore make a burst drill produce nine at a time rather than nine
               times as often, and reading it as an ordinary drill gets the shape of the
               output wrong even where the average is close. */
            entry.put("role", "burst-drill");
            entry.put("tier", burst.tier);
            entry.put("drill_time", burst.drillTime);
            entry.put("hardness_multiplier", burst.hardnessDrillMultiplier);
            entry.put("liquid_boost", burst.liquidBoostIntensity);
            entry.put("boost_liquid", boostLiquidsOf(block));
            entry.put("input_liquid", liquidInputsOf(block));
            return;
        }
        if (block instanceof Drill drill) {
            entry.put("role", "drill");
            entry.put("drill_multipliers", drillMultipliersOf(drill.drillMultipliers));
            entry.put("blocked_items", blockedItemsOf(drill));
            /* L'eau qui la fait aller plus vite, et sans laquelle elle marche : le facteur
               etait dans le catalogue, la quantite non, donc ni le code ni la donnee ne
               savaient combien il en fallait. Une foreuse laser arrosee sort 2,62 objets a
               la seconde contre 1,64 a sec, et le portage donnait 1,64 dans les deux cas. */
            entry.put("boost_liquid", boostLiquidsOf(block));
            entry.put("tier", drill.tier);
            // The game's own formula, kept as its parts rather than as one number: a
            // drill's rate depends on how many ore tiles it covers and how hard they are,
            // so a single "speed" would be a lie for every square but one.
            entry.put("drill_time", drill.drillTime);
            entry.put("hardness_multiplier", drill.hardnessDrillMultiplier);
            entry.put("liquid_boost", drill.liquidBoostIntensity);
            // How fast it gets up to speed. A drill does not start at full pace, and over
            // a thirty second measurement the ramp is worth a whole item.
            entry.put("warmup_speed", drill.warmupSpeed);
            return;
        }
        if (block instanceof Conduit || block instanceof LiquidJunction
                || block instanceof LiquidRouter || block instanceof LiquidBridge) {
            // Liquids move through their own network, and leaving them out is not a small
            // omission: a schematic that turns water into power reads as producing nothing
            // at all, or worse, as producing its own intermediates for free.
            // Liquids and items travel on networks that never touch. Saying which one a
            // carrier belongs to is what stops a conveyor from being credited with
            // delivering water, which reads as a working factory and is not one.
            // Told apart rather than lumped together, and the lumping was not harmless:
            // a conduit points somewhere and a liquid router does not, so the four of them
            // sharing one role meant either every pipe leaked sideways or every router
            // was a one-way street. The first was the state of things; a schematic's
            // pipes fed themselves in both directions.
            entry.put("role",
                block instanceof LiquidBridge ? "bridge"
                : block instanceof LiquidJunction ? "junction"
                : block instanceof LiquidRouter ? "router"
                : "conduit");
            entry.put("carries", "liquid");
            if (block instanceof LiquidBridge bridge) {
                // A liquid bridge is an ItemBridge, and it was sent down this branch to be
                // told it carries liquid - which lost its range on the way. With no range
                // every link it stored was judged out of reach and thrown away: six phase
                // conduits with no line drawn between them and, worse, no edge in the
                // graph, so the liquid stopped there.
                entry.put("range", bridge.range);
            }
            return;
        }
        if (block instanceof mindustry.world.blocks.sandbox.PowerSource source) {
            // The sandbox tap for electricity. Not a `PowerGenerator`, so it fell through
            // every branch and read as a plain wire: a scenario built on one measured a
            // factory with no power at all.
            entry.put("role", "power");
            entry.put("power_out", source.powerProduction * TPS);
            return;
        }
        if (block instanceof BeamNode beam) {
            /* Erekir's wire, which is a battery rather than a wire: `outputsPower` and
               `consumesPower` are both true and the consumer is buffered, so the game
               files it under batteries and it holds a thousand. It matched no branch at
               all before this, so a beam node carried no power and joined no grid: an
               Erekir base wired entirely with them read as unpowered. */
            entry.put("role", "power");
            entry.put("range", beam.range);
            return;
        }
        if (block instanceof UnitCargoLoader tether) {
            /* Il construit exactement une unite puis cesse de consommer quoi que ce soit,
               et cette unite est tout son debit : elle va au chargeur, prend ce qu'elle peut
               porter, vole jusqu'a un point de dechargement regle sur cet objet, et le lache
               par bouffees. Le debit est donc un aller-retour. */
            entry.put("role", "cargo-loader");
            entry.put("carries", "item");
            entry.put("unit_build_time", tether.unitBuildTime);
            entry.put("unit_type", tether.unitType.name);
            entry.put("input_liquid", liquidInputsOf(block));
            return;
        }
        if (block instanceof UnitCargoUnloadPoint point) {
            entry.put("role", "cargo-unload");
            entry.put("carries", "item");
            entry.put("stale_time", point.staleTimeDuration);
            return;
        }
        if (block instanceof UnitAssemblerModule module) {
            // Un module colle a un assembleur lui donne acces au plan du dessus.
            entry.put("role", "assembler-module");
            entry.put("carries", "payload");
            entry.put("tier", module.tier);
            return;
        }
        if (block instanceof UnitAssembler assembler) {
            /* Un assembleur n'avance que de la fraction de ses drones **en position**, donc
               son debit est une question de vol avant d'etre une question de recette. */
            entry.put("role", "unit-assembler");
            entry.put("carries", "payload");
            entry.put("area_size", assembler.areaSize);
            entry.put("drones_created", assembler.dronesCreated);
            entry.put("drone_construct_time", assembler.droneConstructTime);
            entry.put("drone_type", assembler.droneType.name);
            Jval plans = Jval.newArray();
            for (UnitAssembler.AssemblerUnitPlan one : assembler.plans) {
                Jval made = Jval.newObject();
                made.put("unit", one.unit.name);
                made.put("time", one.time);
                Jval needs = Jval.newObject();
                if (one.requirements != null) {
                    for (mindustry.type.PayloadStack stack : one.requirements) {
                        needs.put(stack.item.name, stack.amount);
                    }
                }
                made.put("payloads", needs);
                plans.asArray().add(made);
            }
            entry.put("plans", plans);
            entry.put("input_liquid", liquidInputsOf(block));
            return;
        }
        if (block instanceof PayloadMassDriver driver) {
            /* Le meme principe que le mass driver a objets, pour un bloc porte entier, avec
               une barriere de plus : la cargaison doit avoir glisse jusqu'au bout du canon
               avant qu'on puisse tirer, et le tir lui-meme demande cent images de charge
               par-dessus les trente de rechargement. */
            entry.put("role", "payload-driver");
            entry.put("carries", "payload");
            entry.put("range", driver.range / TILESIZE);
            entry.put("rotate_speed", driver.rotateSpeed);
            entry.put("reload", driver.reload);
            entry.put("charge_time", driver.chargeTime);
            /* Le temps de vol de l effet de transfert, qui n est pas decoratif : le
               recepteur ne commence son rechargement qu a la fin. */
            entry.put("transfer_time", driver.transferEffect.lifetime);
            entry.put("length", driver.length);
            entry.put("knockback", driver.knockback);
            entry.put("max_payload_size", driver.maxPayloadSize);
            return;
        }
        if (block instanceof PayloadDeconstructor taker) {
            /* Un bloc entre, son propre cout de construction en sort, au fil du temps. */
            entry.put("role", "payload-deconstructor");
            entry.put("carries", "payload");
            entry.put("deconstruct_speed", taker.deconstructSpeed);
            entry.put("dump_rate", taker.dumpRate);
            entry.put("max_payload_size", taker.maxPayloadSize);
            return;
        }
        if (block instanceof PayloadLoader loader) {
            /* Un chargeur remplit le bloc qu'il porte, un dechargeur le vide. Les deux
               regardent **dedans**, ce qu'aucun autre bloc du jeu ne fait. */
            entry.put("role", block instanceof PayloadUnloader
                ? "payload-unloader" : "payload-loader");
            entry.put("carries", "payload");
            entry.put("load_time", loader.loadTime);
            entry.put("items_loaded", loader.itemsLoaded);
            entry.put("liquids_loaded", loader.liquidsLoaded);
            entry.put("max_block_size", loader.maxBlockSize);
            if (block instanceof PayloadUnloader out) {
                entry.put("offload_speed", out.offloadSpeed);
            }
            return;
        }
        if (block instanceof LaunchPad pad) {
            /* Une plateforme de lancement n'est pas un puits : elle se remplit jusqu'a sa
               capacite, puis tout part d'un coup et le compteur repart. Ce qu'elle avale
               par seconde est donc sa capacite divisee par son delai, et rien du tout tant
               qu'elle n'est pas pleine. */
            entry.put("role", "launch-pad");
            entry.put("carries", "item");
            entry.put("launch_time", pad.launchTime);
            /* Et ce qu'elle boit : la grande plateforme tourne au petrole, et sans lui son
               efficacite est nulle, donc son compteur ne bouge pas d'une image. */
            entry.put("input_liquid", liquidInputsOf(block));
            if (pad.acceptMultipleItems) entry.put("accept_multiple_items", true);
            entry.put("items_per_second", block.itemCapacity * TPS
                / Math.max(1f, pad.launchTime));
            return;
        }
        if (block instanceof PowerVoid) {
            /* Le puits a courant : `consumePower(Float.MAX_VALUE)`. Il ne demande pas
               beaucoup, il demande tout, et toute sa grille tombe a zero. */
            entry.put("role", "power-void");
            return;
        }
        if (block instanceof PowerDiode) {
            /* Le seul bloc qui deplace de la charge entre deux grilles sans etre sur
               aucune des deux. Classe en `sink`, deux grilles que le jeu maintient au meme
               niveau restaient l une pleine et l autre a plat. */
            entry.put("role", "diode");
            return;
        }
        if (block instanceof PowerNode || block instanceof Battery) {
            // Wires and buffers. They neither make nor spend power on balance, but a
            // schematic full of them is a power schematic, and saying so is most of what a
            // reader needs.
            entry.put("role", "power");
            return;
        }
        if (block instanceof HeatProducer heater) {
            // Erekir's chemistry runs on heat, which travels its own way: not on a belt and
            // not on the power grid, but from a block's face to the face touching it.
            entry.put("role", "crafter");
            entry.put("heat_output", heater.heatOutput);
            entry.put("warmup_rate", heater.warmupRate);
            entry.put("craft_time", heater.craftTime);
            entry.put("input", inputsOf(block));
            entry.put("input_liquid", liquidInputsOf(block));
            entry.put("output", craftedItemsOf(block));
            entry.put("output_liquid", craftedLiquidsOf(block));
            return;
        }
        if (block instanceof HeatConductor conductor) {
            entry.put("role", "heat-conductor");
            if (conductor.splitHeat) entry.put("split_heat", true);
            return;
        }
        if (block instanceof HeatCrafter hot) {
            entry.put("role", "crafter");
            entry.put("heat_requirement", hot.heatRequirement);
            entry.put("overheat_scale", hot.overheatScale);
            entry.put("max_efficiency", hot.maxEfficiency);
            entry.put("craft_time", hot.craftTime);
            entry.put("input", inputsOf(block));
            entry.put("input_liquid", liquidInputsOf(block));
            entry.put("output", craftedItemsOf(block));
            entry.put("output_liquid", craftedLiquidsOf(block));
            entry.put("power", block.consPower != null ? block.consPower.usage * TPS : 0f);
            return;
        }
        if (block instanceof AttributeCrafter boosted) {
            /* A factory whose speed is decided by the ground under it. The boost is the
               sum of one attribute over every tile it covers, not an average: a two by two
               cultivator on four tiles of spore moss reads 1.2, not 0.3. */
            entry.put("role", "crafter");
            entry.put("attribute", boosted.attribute.name);
            entry.put("base_efficiency", boosted.baseEfficiency);
            entry.put("boost_scale", boosted.boostScale);
            entry.put("max_boost", boosted.maxBoost);
            if (boosted.scaleLiquidConsumption) entry.put("scale_liquid_consumption", true);
            entry.put("craft_time", boosted.craftTime);
            entry.put("input", inputsOf(block));
            entry.put("input_liquid", liquidInputsOf(block));
            entry.put("output", craftedItemsOf(block));
            entry.put("output_liquid", craftedLiquidsOf(block));
            entry.put("power", block.consPower != null ? block.consPower.usage * TPS : 0f);
            return;
        }
        if (block instanceof Separator sorted) {
            /* One item per batch, drawn from a weighted list. The draw is a pure function
               of a counter kept on the block, so the sequence is reproducible, but the
               total is reproducible without reproducing the draw at all: every batch
               yields exactly one item whatever it lands on. */
            entry.put("role", "separator");
            entry.put("craft_time", sorted.craftTime);
            Jval results = Jval.newArray();
            for (ItemStack stack : sorted.results) {
                Jval one = Jval.newObject();
                one.put("item", stack.item.name);
                one.put("amount", stack.amount);
                results.asArray().add(one);
            }
            entry.put("results", results);
            entry.put("input", inputsOf(block));
            entry.put("input_liquid", liquidInputsOf(block));
            entry.put("power", block.consPower != null ? block.consPower.usage * TPS : 0f);
            return;
        }
        if (block instanceof GenericCrafter crafter) {
            entry.put("role", "crafter");
            /* Un bloc du jeu verse ses deux liquides par deux faces nommees : l'ozone de
               l'electrolyseur sort par la face relative 1 et l'hydrogene par la 3. Verses
               partout, un plan qui separe correctement les deux gaz les melange, et un plan
               qui ne branche qu'une face recoit un debit qui n'existe pas. */
            if (crafter.liquidOutputDirections != null
                    && crafter.liquidOutputDirections.length > 0) {
                Jval faces = Jval.newArray();
                for (int dir : crafter.liquidOutputDirections) {
                    faces.asArray().add(Jval.valueOf(dir));
                }
                entry.put("liquid_output_directions", faces);
            }
            /* Ecrits a l'envers, parce que le catalogue jette les valeurs fausses : le
               defaut du jeu est `dumpExtraLiquid = true`, donc "absent" doit vouloir dire
               vrai et c'est l'exception qu'il faut nommer. */
            if (!crafter.dumpExtraLiquid) entry.put("no_dump_extra", true);
            if (crafter.ignoreLiquidFullness) entry.put("ignore_liquid_fullness", true);
            entry.put("craft_time", crafter.craftTime);
            entry.put("crafts_per_second", TPS / Math.max(1f, crafter.craftTime));

            Jval output = Jval.newObject();
            if (crafter.outputItems != null) {
                for (ItemStack stack : crafter.outputItems) {
                    output.put(stack.item.name, stack.amount);
                }
            }
            entry.put("output", output);

            // Liquids out, per second, since a liquid is produced continuously rather than
            // in batches. A spore press makes oil and nothing else, and without this the
            // press reads as consuming spore pods and returning nothing.
            Jval liquidOut = Jval.newObject();
            if (crafter.outputLiquids != null) {
                for (LiquidStack stack : crafter.outputLiquids) {
                    liquidOut.put(stack.liquid.name, stack.amount * TPS);
                }
            }
            entry.put("output_liquid", liquidOut);

            entry.put("input", inputsOf(crafter));
            entry.put("input_liquid", liquidInputsOf(crafter));
            return;
        }
        if (block instanceof SolidPump ground) {
            /* A pump that makes liquid out of dry land: a water extractor and an oil
               extractor. Filed under pumps, both read as pumps that need liquid ground and
               so made nothing at all, which is exactly backwards - a solid pump only works
               where the ground is **not** liquid.

               The two differ by one number that changes everything. `baseEfficiency` is 1
               for the water extractor, so it works anywhere and the ground attribute is a
               bonus; it is 0 for the oil extractor, so the attribute is the whole output
               and an oil extractor off the sand makes nothing. */
            entry.put("role", "solid-pump");
            entry.put("carries", "liquid");
            entry.put("pump_amount", ground.pumpAmount);
            entry.put("base_efficiency", ground.baseEfficiency);
            if (ground.attribute != null) entry.put("attribute", ground.attribute.name);
            if (ground.result != null) {
                Jval out = Jval.newObject();
                out.put(ground.result.name, ground.pumpAmount * TPS);
                entry.put("output_liquid", out);
            }
            if (block instanceof Fracker fracker) entry.put("item_use_time", fracker.itemUseTime);
            entry.put("input", inputsOf(block));
            entry.put("input_liquid", liquidInputsOf(block));
            return;
        }
        if (block instanceof Pump pump) {
            // What a player actually installs to feed a schematic. Stated per second over a
            // full footprint of liquid, which is the figure the game itself shows.
            entry.put("role", "pump");
            entry.put("output_per_second", TPS * pump.pumpAmount * block.size * block.size);
            // Per tile as well as per pump, because a pump half on the water pumps half
            // as much: the game sums `liquidMultiplier` over the tiles it covers.
            entry.put("pump_amount", pump.pumpAmount);
            entry.put("input_liquid", liquidInputsOf(block));
            return;
        }
        if (block instanceof PowerGenerator generator) {
            // What the whole schematic exists for, in the case that started this: water in,
            // power out. Classified as a sink before, with no consumption at all, so the
            // coal feeding it was counted as the layout's output.
            entry.put("role", "generator");
            entry.put("input", inputsOf(block));
            entry.put("input_liquid", liquidInputsOf(block));
            entry.put("craft_time", itemDurationOf(block));
            describeGenerator(block, entry);
            return;
        }
        if (block instanceof ItemTurret turret) {
            // A turret eats ammunition, and it was filed as a sink that consumed nothing:
            // a belt feeding one carried items into a hole and the layout read as wasting
            // them. How fast it eats depends on how often it fires, which a still picture
            // cannot know, so the rate here is the rate while firing and is labelled so.
            entry.put("role", "turret");
            entry.put("carries", "item");
            /* Seventeen of the twenty-eight visible turrets had no range at all, `duo` and
               `salvo` and `spectre` among them, because this branch answers before the
               `BaseTurret` one that writes the field and it never wrote it itself. An
               absent field draws no line rather than a wrong one, which is why nobody had
               noticed that half the catalogue was silent about the one number a turret is
               looked up for. */
            entry.put("range", turret.range / TILESIZE);
            entry.put("reload", turret.reload);
            entry.put("ammo_per_shot", turret.ammoPerShot);
            entry.put("shots_per_second", TPS / Math.max(1f, turret.reload));

            Jval ammo = Jval.newArray();
            for (Item item : turret.ammoTypes.keys()) {
                ammo.asArray().add(Jval.valueOf(item.name));
            }
            entry.put("ammo", ammo);
            // How much it holds, in ammunition rather than in items, and what each item is
            // worth when it arrives. A turret fills to `maxAmmo` and then refuses, which is
            // what backs a belt up behind it.
            entry.put("max_ammo", turret.maxAmmo);
            Jval worth = Jval.newObject();
            for (Item item : turret.ammoTypes.keys()) {
                worth.put(item.name, turret.ammoTypes.get(item).ammoMultiplier);
            }
            entry.put("ammo_worth", worth);
            entry.put("input_liquid", liquidInputsOf(block));
            return;
        }
        if (block instanceof Unloader unloader) {
            // It pulls out of whatever container it touches, so it is a source rather than
            // a sink: modelled as neither, a line starting at one started at nothing.
            entry.put("role", "unloader");
            entry.put("carries", "item");
            // `60f / speed`, which is what the game puts on its own stat line. Written as
            // `speed * 60` it came out at 327 items a second instead of 11: thirty times
            // too fast, and a container behind one looked like an inexhaustible mine.
            entry.put("items_per_second", TPS / Math.max(0.0001f, unloader.speed));
            // Frames between two pulls, which is what the simulation counts. `60 / speed`
            // is what a player reads; `speed` is what the block actually uses.
            entry.put("speed", unloader.speed);
            if (unloader.allowCoreUnload) entry.put("allow_core_unload", true);
            return;
        }
        if (block instanceof ItemSource source) {
            // Sandbox blocks, and the reason a test layout reads as producing nothing:
            // filed as sinks, the twelve sources feeding a reactor farm looked like twelve
            // places its output disappeared into.
            entry.put("role", "source");
            entry.put("carries", "item");
            entry.put("output_per_second", source.itemsPerSecond);
            return;
        }
        if (block instanceof LiquidSource) {
            entry.put("role", "source");
            entry.put("carries", "liquid");
            // It refills itself every tick, so what comes out is whatever the pipe on the
            // other side can take. Stated as its own capacity per tick, which is past any
            // real pipe by three orders of magnitude.
            entry.put("output_per_second", block.liquidCapacity * TPS);
            return;
        }
        if (block instanceof UnitFactory factory) {
            /* A unit factory is a crafter whose output is not an item.
            
               It carries a list of plans - a unit, how long it takes, what it costs - and
               the schematic says which one is selected. Everything else about it is a
               `GenericCrafter`: progress accumulates while it has what it needs, and a
               unit comes out when the progress is done. */
            entry.put("role", "unit-factory");
            Jval plans = Jval.newArray();
            for (UnitFactory.UnitPlan plan : factory.plans) {
                Jval one = Jval.newObject();
                one.put("unit", plan.unit.name);
                one.put("unit_id", plan.unit.id);
                one.put("time", plan.time);
                Jval needs = Jval.newObject();
                for (ItemStack stack : plan.requirements) {
                    needs.put(stack.item.name, stack.amount);
                }
                one.put("requirements", needs);
                plans.asArray().add(one);
            }
            entry.put("plans", plans);
            entry.put("input_liquid", liquidInputsOf(block));
            return;
        }
        /* The defensive blocks, none of which shoots anything in a measurement and all of
           which were filed as sinks that consume nothing.

           What they do at rest is the whole question for a schematic, and the four answers
           are all different. A liquid turret swallows its tank once and never drinks
           again. A power turret draws until it has finished reloading and then stops
           dead. A meltdown drinks two hundred and twenty five water winding **down** and
           then stops. A projector draws power for ever and eats an item every few
           seconds whether or not anything near it is damaged. */
        if (block instanceof BaseTurret turret) {
            entry.put("role", block instanceof TractorBeamTurret ? "tractor" : "turret-idle");
            entry.put("range", turret.range / TILESIZE);
            if (block instanceof ReloadTurret reloader) entry.put("reload", reloader.reload);
            entry.put("coolant_multiplier", turret.coolantMultiplier);
            if (turret.coolant != null) {
                entry.put("coolant_amount", turret.coolant.amount);
                /* What one unit of each accepted coolant is worth to the reload counter:
                   `heatCapacity * coolantMultiplier`. Written per liquid so nothing on the
                   other side has to carry a table of heat capacities around, and because
                   `coolantMultiplier` is 5 by default and 1 for a meltdown, which is a
                   fivefold error waiting to happen. */
                Jval worth = Jval.newObject();
                for (Liquid liquid : Vars.content.liquids()) {
                    if (block.liquidFilter != null && block.liquidFilter.length > liquid.id
                            && block.liquidFilter[liquid.id]) {
                        worth.put(liquid.name, liquid.heatCapacity * turret.coolantMultiplier);
                    }
                }
                if (worth.asObject().size > 0) entry.put("coolant_worth", worth);
            }
            if (block instanceof LaserTurret laser) {
                entry.put("role", "laser-turret");
                entry.put("shoot_duration", laser.shootDuration);
            }
            if (block instanceof LiquidTurret liquidTurret) {
                entry.put("role", "turret-idle");
                /* Walked in content order rather than in the map's own, because
                   `LiquidTurret.ammoTypes` is a plain `ObjectMap` whose iteration follows
                   the identity hash and therefore changes from one run to the next. Two
                   dumps of an untouched game disagreed on `wave` and `tsunami` for exactly
                   this reason, which is eight lines of noise in the middle of a 450 kB
                   diff and no way to tell them from a real regression.

                   `ItemTurret.ammoTypes` is an `OrderedMap` and does not have the fault,
                   which is why only one of the two tables is walked this way. Checked in
                   the v159.7 bytecode rather than assumed. */
                Jval ammo = Jval.newObject();
                for (Liquid liquid : Vars.content.liquids()) {
                    BulletType type = liquidTurret.ammoTypes.get(liquid);
                    if (type != null) ammo.put(liquid.name, type.ammoMultiplier);
                }
                if (ammo.asObject().size > 0) entry.put("ammo_types", ammo);
            }
            entry.put("input_liquid", liquidInputsOf(block));
            return;
        }
        if (block instanceof MendProjector mender) {
            entry.put("role", "mender");
            entry.put("reload", mender.reload);
            entry.put("range", mender.range / TILESIZE);
            entry.put("heal_percent", mender.healPercent);
            entry.put("phase_boost", mender.phaseBoost);
            /* Divided here as well, and it is the more insidious half of the two: the
               overdrive projector below already wrote its `phase_range_boost` in tiles, so
               one key carried both units at once and nothing on the far side could tell a
               mender's boost from a projector's. */
            entry.put("phase_range_boost", mender.phaseRangeBoost / TILESIZE);
            entry.put("use_time", mender.useTime);
            entry.put("boost_input", optionalInputsOf(block));
            return;
        }
        if (block instanceof ForceProjector shield) {
            entry.put("role", "shield");
            /* A range under another name, and in the same world units the rest of this
               file has stopped using. */
            entry.put("radius", shield.radius / TILESIZE);
            entry.put("shield_health", shield.shieldHealth);
            entry.put("phase_radius_boost", shield.phaseRadiusBoost / TILESIZE);
            entry.put("phase_shield_boost", shield.phaseShieldBoost);
            entry.put("use_time", shield.phaseUseTime);
            entry.put("coolant_consumption", shield.coolantConsumption);
            entry.put("boost_input", optionalInputsOf(block));
            return;
        }
        /* Blocks that draw power only when they have something to work on, and so draw
           **nothing** in a still schematic.

           `shouldConsume` is `anyTargets` for a regen projector, `target != null` for a
           repair turret, `targets.size > 0` for a repair tower. Nothing is damaged in a
           schematic and no units are standing in it, so all three are free. Counted as
           permanent consumers they invented four hundred and twenty power a second between
           them, which dims a whole base in the report and in nothing else. */
        if (block instanceof RegenProjector || block instanceof RepairTurret
                || block instanceof RepairTower) {
            entry.put("role", "idle-power");
            /* `RegenProjector.range` fell through to the zero and was thrown away by the
               trimmer, so the block reached the browser with no range at all. It is the
               one distance in the game already counted in tiles - an `int`, where the two
               repairers hold floats of world units - which is exactly why it needs saying
               out loud: the line that divides everything else must not divide this one. */
            entry.put("range", block instanceof RepairTurret repair ? repair.repairRadius / TILESIZE
                : block instanceof RepairTower tower ? tower.range / TILESIZE
                : block instanceof RegenProjector regen ? regen.range
                : 0f);
            return;
        }
        if (block instanceof ShockwaveTower shock) {
            /* Same family, by a stranger route. `shouldConsume` is `reloadCounter < reload`
               and it looks like a run up, but the counter **starts at a random value**
               between zero and the reload, and only returns to zero when the tower actually
               fires. With no bullets to knock down it reaches a full reload once and is
               silent for ever after.

               So the steady state is the same zero as a repair turret's, and the transient
               is a random couple of seconds nobody can reproduce and nobody would notice:
               three thousandths of a large battery. */
            entry.put("role", "idle-power");
            entry.put("reload", shock.reload);
            entry.put("range", shock.range / TILESIZE);
            return;
        }
        if (block instanceof Incinerator || block instanceof ItemIncinerator) {
            /* An incinerator is a sink with a condition, and unpowered it is a **wall**.

               `acceptItem` is `heat > 0.5f`, and `heat` creeps towards `efficiency` at
               0.04 a frame: thirteen frames of power before it will take anything, and
               nothing ever if the grid is down. A belt into one backs up, which is the
               opposite of what a sink does and exactly what a player wants to know. The
               slag one asks `efficiency > 0` instead, which is its slag rather than its
               power. */
            entry.put("role", "incinerator");
            entry.put("carries", "item");
            entry.put("input_liquid", liquidInputsOf(block));
            return;
        }
        if (block instanceof ItemVoid || block instanceof LiquidVoid) {
            /* The sandbox drains. A liquid void was filed under items, so it refused every
               drop and the pipe into it backed up instead of emptying. */
            entry.put("role", "void");
            entry.put("carries", block instanceof LiquidVoid ? "liquid" : "item");
            return;
        }
        if (block instanceof Radar radar) {
            entry.put("role", "radar");
            entry.put("discovery_time", radar.discoveryTime);
            return;
        }
        if (block instanceof OverdriveProjector projector) {
            // Range is in world units in the game and in tiles here, because every other
            // distance on this site is in tiles and one unit per file is how a conversion
            // gets forgotten.
            entry.put("role", "projector");
            entry.put("boost", projector.speedBoost);
            entry.put("boost_phase", projector.speedBoostPhase);
            entry.put("range", projector.range / TILESIZE);
            entry.put("phase_range_boost", projector.phaseRangeBoost / TILESIZE);
            entry.put("boost_input", optionalInputsOf(block));
            entry.put("boost_time", projector.useTime);
            entry.put("use_time", projector.useTime);
            entry.put("reload", projector.reload);
            /* Whether the phase fabric is a bonus or a requirement. An overdrive dome has
               `hasBoost` false and its two items are **not** optional: without them it
               boosts nothing at all, where a projector without phase fabric simply boosts
               a little less. Reading both as bonuses makes a starved dome look busy. */
            if (projector.hasBoost) entry.put("has_boost", true);
            entry.put("input", inputsOf(block));
            return;
        }
        if (block instanceof mindustry.world.blocks.storage.CoreBlock) {
            // A container that counts, and where most schematics are meant to deliver.
            entry.put("role", "core");
            entry.put("carries", "item");
            entry.put("item_capacity", block.itemCapacity);
            return;
        }
        if (block instanceof StorageBlock) {
            // A vault, a container, a core. It takes anything and gives anything back to
            // whatever pulls from it.
            entry.put("role", "store");
            entry.put("carries", "item");
            entry.put("item_capacity", block.itemCapacity);
            return;
        }
        if (block.hasItems && block.acceptsItems) {
            // Turrets and anything else that swallows items without producing any. They
            // are sinks, and a layout that feeds one is doing something useful even though
            // nothing comes back out.
            entry.put("role", "sink");
            entry.put("input", inputsOf(block));
            entry.put("input_liquid", liquidInputsOf(block));
            return;
        }
        if (block.hasLiquids && block.consumesPower) {
            entry.put("role", "sink");
            entry.put("input_liquid", liquidInputsOf(block));
        }
    }

    /**
     * The ground, which decides what a drill on it actually pulls out.
     *
     * <p>Without it a drill can only be reported at its best case, on a full patch of
     * whatever the reader imagines, which is the tool admitting it does not know what the
     * drill is standing on. `itemDrop` and `liquidDrop` are what the game asks when a
     * drill or a pump looks down, so they are what gets asked here.
     */
    /**
     * La chaine de dessin d un bloc, a plat, reduite a ce qu un canvas sait refaire.
     *
     * <p>Le jeu empile des {@code DrawBlock} : une plaque, un rotor, une lueur additive qui
     * pulse avec le warmup, une teinte de chaleur qui suit le {@code heatFrac}. Chacun porte
     * ses propres constantes - couleur, echelle de pulsation, vitesse de rotation - et c est
     * exactement ce qu un rendu fidele doit lire au lieu de le supposer.
     *
     * <p>Seuls les dessinateurs qui bougent sont dumpes. {@code DrawDefault} et compagnie ne
     * disent rien qu une image fixe ne dise deja.
     */
    private static Jval drawersOf(Block block) {
        Jval list = Jval.newArray();
        if (!(block instanceof mindustry.world.blocks.production.GenericCrafter
                || block instanceof mindustry.world.blocks.heat.HeatProducer
                || block instanceof mindustry.world.blocks.heat.HeatConductor
                || block instanceof mindustry.world.blocks.production.Separator
                || block instanceof mindustry.world.blocks.power.PowerGenerator)) {
            return list;
        }
        mindustry.world.draw.DrawBlock drawer = drawerField(block);
        if (drawer == null) return list;
        flatten(drawer, list);
        return list;
    }

    /** Le champ {@code drawer}, qui n est declare que sur certaines familles de blocs. */
    private static mindustry.world.draw.DrawBlock drawerField(Block block) {
        try {
            java.lang.reflect.Field field = block.getClass().getField("drawer");
            Object value = field.get(block);
            return value instanceof mindustry.world.draw.DrawBlock painted ? painted : null;
        } catch (ReflectiveOperationException | RuntimeException ignored) {
            return null;
        }
    }

    private static void flatten(mindustry.world.draw.DrawBlock drawer, Jval list) {
        if (drawer instanceof mindustry.world.draw.DrawMulti many) {
            for (mindustry.world.draw.DrawBlock one : many.drawers) flatten(one, list);
            return;
        }
        Jval one = Jval.newObject();
        if (drawer instanceof mindustry.world.draw.DrawGlowRegion glow) {
            one.put("kind", "glow");
            one.put("suffix", glow.suffix);
            one.put("color", hex(glow.color));
            one.put("alpha", glow.alpha);
            one.put("scale", glow.glowScale);
            one.put("intensity", glow.glowIntensity);
            one.put("rotate_speed", glow.rotateSpeed);
        } else if (drawer instanceof mindustry.world.draw.DrawHeatRegion heat) {
            one.put("kind", "heat");
            one.put("suffix", heat.suffix);
            one.put("color", hex(heat.color));
            one.put("alpha", heat.color.a);
            one.put("pulse", heat.pulse);
            one.put("scale", heat.pulseScl);
        } else if (drawer instanceof mindustry.world.draw.DrawHeatOutput out) {
            one.put("kind", "heat");
            one.put("suffix", "-heat");
            one.put("color", hex(out.heatColor));
            one.put("alpha", out.heatColor.a);
            one.put("pulse", out.heatPulse);
            one.put("scale", out.heatPulseScl);
        } else if (drawer instanceof mindustry.world.draw.DrawRegion turned
                && turned.rotateSpeed != 0f) {
            one.put("kind", "rotator");
            one.put("suffix", turned.suffix);
            one.put("rotate_speed", turned.rotateSpeed);
        } else if (drawer instanceof mindustry.world.draw.DrawLiquidRegion wet) {
            one.put("kind", "liquid");
            one.put("suffix", wet.suffix);
            if (wet.drawLiquid != null) one.put("liquid", wet.drawLiquid.name);
        } else if (drawer instanceof mindustry.world.draw.DrawLiquidTile tile) {
            one.put("kind", "liquid");
            one.put("suffix", "-liquid");
            if (tile.drawLiquid != null) one.put("liquid", tile.drawLiquid.name);
        } else if (drawer instanceof mindustry.world.draw.DrawFlame flame) {
            one.put("kind", "flame");
            one.put("color", hex(flame.flameColor));
            one.put("radius", flame.flameRadius);
            one.put("scale", flame.flameRadiusScl);
            one.put("magnitude", flame.flameRadiusMag);
        } else {
            return;
        }
        list.asArray().add(one);
    }

    /** Une couleur du jeu, en `#rrggbb`, parce que c est ce qu un canvas comprend. */
    private static String hex(arc.graphics.Color colour) {
        return "#" + colour.toString().substring(0, 6);
    }

    /**
     * What a cache layer is called, which the class itself does not carry.
     *
     * <p>{@code CacheLayer} holds an {@code id} and a {@code liquid} flag and no name, and
     * its {@code id} is a position in {@code CacheLayer.all} that a mod may shift. The names
     * are the class's own public static fields, so they are read back off it by identity: a
     * layer added in a later version arrives here under its real name without anybody having
     * to remember to add it to a list.
     */
    private static String cacheLayerName(mindustry.graphics.CacheLayer layer) {
        for (java.lang.reflect.Field field : mindustry.graphics.CacheLayer.class.getFields()) {
            if (!java.lang.reflect.Modifier.isStatic(field.getModifiers())) continue;
            if (field.getType() != mindustry.graphics.CacheLayer.class) continue;
            try {
                if (field.get(null) == layer) return field.getName();
            } catch (IllegalAccessException ignored) {
                // A public static field of a public class is always readable.
            }
        }
        return "layer-" + layer.id;
    }

    private static void describeFloor(Block block, Jval entry) {
        /* A static wall that drops something, which is Erekir's whole ore economy: there
           are no patches on the ground there, the ore is in the cliffs and a plasma bore
           eats sideways into them. Recorded as a wall rather than a floor, because it is
           neither painted under a block nor built by a player: it is what a bore has to be
           pointed at. */
        if (block instanceof StaticWall wall) {
            entry.put("wall", true);
            if (wall.itemDrop != null) entry.put("drops", wall.itemDrop.name);
            entry.put("attributes", attributesOf(block));
            return;
        }
        if (!(block instanceof Floor floor)) {
            return;
        }
        // A floor may carry ore too, in the walls sense: `wallOre` says a bore may take it
        // even though a drill standing on it may not.
        if (floor.wallOre) entry.put("wall_ore", true);
        // An overlay is an ore laid over a floor; a floor is the ground itself. Told apart
        // because painting one replaces the ground and painting the other does not.
        entry.put("floor", true);
        /* What decides whether two floors bleed into each other, read from the game rather
           than inferred.

           `Floor.drawBase` is `drawMain(tile); if(drawEdgeIn) drawEdges(tile); drawOverlay
           (tile);`, so a floor with `drawEdgeIn` false receives no boundary at all, and the
           two flags are separate questions: one is whether this floor spills outwards, the
           other whether anything spills onto it.

           Inside `drawEdges`, `doEdge` compares `realBlendId` on both sides and the higher
           one wins, a neighbour whose `drawEdgeOut` is false is skipped, and so is one whose
           floor sits on a different `cacheLayer`. That last gate is why water never blends
           into land: the game draws the liquid layers in their own pass.

           These five go to the bench dump and stop there. `build_catalogue.py` filters on
           its KEEP tuple, so they do not reach `site/public/forge/blocks.json`, which
           `EngineVersion` hashes. They decide how a page looks and no answer it gives, and
           the day they enter the catalogue is the day fifteen thousand analyses go stale
           for the sake of presentation. */
        entry.put("blend_id", floor.blendId);
        if (!floor.drawEdgeIn) entry.put("draw_edge_in", false);
        if (!floor.drawEdgeOut) entry.put("draw_edge_out", false);
        if (floor.blendGroup != floor) entry.put("blend_group", floor.blendGroup.name);
        // Omitted for the default layer, so the dump stays small and the default stays the
        // thing a reader sees when a floor says nothing.
        if (floor.cacheLayer != mindustry.graphics.CacheLayer.normal) {
            entry.put("cache_layer", cacheLayerName(floor.cacheLayer));
        }
        if (block instanceof OverlayFloor) entry.put("overlay", true);

        // What a floor is worth to a block standing on it. A cultivator on spore moss goes
        // faster, and how much faster is the sum of this over every tile it covers.
        Jval gives = Jval.newObject();
        for (mindustry.world.meta.Attribute attribute : mindustry.world.meta.Attribute.all) {
            float value = floor.attributes.get(attribute);
            if (value != 0f) gives.put(attribute.name, value);
        }
        if (gives.asObject().size > 0) entry.put("attributes", gives);
        if (floor.isLiquid) entry.put("floor_liquid", true);
        if (floor.playerUnmineable) entry.put("unmineable", true);
        if (floor.itemDrop != null) entry.put("drops", floor.itemDrop.name);
        if (floor.liquidDrop != null) {
            entry.put("drops_liquid", floor.liquidDrop.name);
            entry.put("liquid_multiplier", floor.liquidMultiplier);
        }
        if (floor.isDeep()) entry.put("deep", true);
        entry.put("buildable", floor.hasSurface() || floor.placeableOn);
    }

    /**
     * Every colour the game answers to by name, which is what tells markup from a title.
     *
     * <p>A schematic name may carry Mindustry's colour markup, and 1 233 of the collected
     * ones do. Stripping it needs the rule the game uses, and that rule is not a pattern:
     * {@code Strings.parseColorMarkup} treats {@code [name]} as a colour only when
     * {@code Colors.get(name)} finds one. Everything else is text, which is why a schematic
     * really called {@code [Silicon]Stackable Thin Crusibles} must survive untouched while
     * {@code [green]} must not.
     *
     * <p>So the answer cannot be a list typed into a PHP file, for the same reason the block
     * catalogue is not one: it would be a second copy of the game's data, right until the
     * game adds a colour. Dumped here, it is read from {@code Colors} itself.
     *
     * <p>Both cases are kept because the game keeps both. {@code Colors} registers
     * {@code GREEN} and {@code green} as separate keys, and the lookup is exact, so
     * {@code [Green]} is not markup and must not be treated as any.
     */
    private static Jval namedColours() {
        Jval out = Jval.newObject();
        for (var entry : arc.graphics.Colors.getColors()) {
            out.put(entry.key, entry.value.toString());
        }
        return out;
    }

    /**
     * The class that decides how a block behaves.
     *
     * <p>Almost every block in the game is declared as an anonymous subclass, `new
     * Conveyor("conveyor"){{ speed = 0.046f; }}`, whose simple name is the empty string.
     * Asked for it directly, three hundred and eighty eight of four hundred and forty six
     * blocks came back nameless. What is wanted is the first named class above it, which
     * is where `updateTile` actually lives.
     */
    /**
     * La planete d un noeud et de tout ce qui pend dessous.
     *
     * <p>Un noeud qui ne declare pas sa planete prend celle de son parent, comme le jeu le
     * fait pour afficher son arbre. Sans cet heritage, les 200 blocs d Erekir sortent
     * annonces sur Serpulo, et une palette qui filtre par planete montre tout partout.
     */
    /**
     * Le nom d une visibilite de construction.
     *
     * <p>`BuildVisibility` ressemble a une enumeration et n en est pas une : c est une
     * classe dont les valeurs sont des champs statiques, chacun construit avec sa propre
     * condition. Elle n a donc pas de `name()`, et recopier ici la liste des douze noms
     * serait une deuxieme copie d une donnee du jeu, exactement ce que ce fichier existe
     * pour eviter. On la lui demande par reflexion : si le jeu en ajoute une, elle sort
     * toute seule.
     */
    private static String visibilityName(BuildVisibility visibility) {
        for (java.lang.reflect.Field field : BuildVisibility.class.getFields()) {
            if (!java.lang.reflect.Modifier.isStatic(field.getModifiers())) continue;
            try {
                if (field.get(null) == visibility) return field.getName();
            } catch (IllegalAccessException ignored) {
                // Un champ public statique inaccessible n existe pas, mais le compilateur
                // exige qu on le dise.
            }
        }
        return "unknown";
    }

    private static void stampPlanet(TechNode node, String planet, Jval blocks) {
        String here = node.planet == null ? planet : node.planet.name;
        if (node.content instanceof Block) {
            Jval entry = blocks.get(node.content.name);
            if (entry != null) entry.put("planet", here);
        }
        for (TechNode child : node.children) stampPlanet(child, here, blocks);
    }

    private static String kindOf(Block block) {
        Class<?> found = block.getClass();
        while (found != null && found.getSimpleName().isEmpty()) {
            found = found.getSuperclass();
        }
        return found == null ? "Block" : found.getSimpleName();
    }

    /** What a crafter of any kind leaves behind, per batch. */
    private static Jval craftedItemsOf(Block block) {
        Jval out = Jval.newObject();
        if (block instanceof GenericCrafter crafter && crafter.outputItems != null) {
            for (ItemStack stack : crafter.outputItems) {
                out.put(stack.item.name, stack.amount);
            }
        }
        return out;
    }

    /** And what it pours, per second, since a liquid comes out continuously. */
    private static Jval craftedLiquidsOf(Block block) {
        Jval out = Jval.newObject();
        if (block instanceof GenericCrafter crafter && crafter.outputLiquids != null) {
            for (LiquidStack stack : crafter.outputLiquids) {
                out.put(stack.liquid.name, stack.amount * TPS);
            }
        }
        return out;
    }

    /** Liquids a block drinks, per second. */
    private static Jval liquidInputsOf(Block block) {
        Jval input = Jval.newObject();
        for (Consume consume : block.consumers) {
            if (consume.optional) continue;
            if (consume instanceof ConsumeLiquid one) {
                input.put(one.liquid.name, one.amount * TPS);
            } else if (consume instanceof ConsumeLiquids many) {
                for (LiquidStack stack : many.liquids) {
                    input.put(stack.liquid.name, stack.amount * TPS);
                }
            }
        }
        return input;
    }

    /**
     * How long one unit of fuel lasts a generator, in ticks.
     *
     * A generator states how much power it makes and how long an item burns, never a rate
     * of consumption, so the rate has to come from the two together.
     */
    private static float itemDurationOf(Block block) {
        if (block instanceof ConsumeGenerator burner) {
            return burner.itemDuration;
        }
        return 0f;
    }

    /**
     * What a block takes to go faster but runs without.
     *
     * Kept apart from {@link #inputsOf}, which had been mixing the two: an overdrive
     * projector with no phase fabric still boosts, and reading its phase fabric as an
     * ingredient makes a working layout report as starved.
     */
    private static Jval optionalInputsOf(Block block) {
        Jval input = Jval.newObject();
        for (Consume consume : block.consumers) {
            if (consume.optional && consume instanceof ConsumeItems items) {
                for (ItemStack stack : items.items) {
                    input.put(stack.item.name, stack.amount);
                }
            }
        }
        return input;
    }

    private static Jval inputsOf(Block block) {
        Jval input = Jval.newObject();
        for (Consume consume : block.consumers) {
            if (consume.optional) continue;
            if (consume instanceof ConsumeItems items) {
                for (ItemStack stack : items.items) {
                    input.put(stack.item.name, stack.amount);
                }
            }
        }
        return input;
    }

    public static Path defaultOut() {
        return Paths.get("analyser", "data", "blocks.json");
    }

    /**
     * What tells one generator apart from another, past its nameplate.
     *
     * Six classes hide behind "makes power" and none of them works like the next. A
     * combustion generator's output is the **flammability of what it is burning**, so it
     * makes fifteen per cent more on spore pods and forty per cent more on pyratite. A
     * thermal generator's output is the ground under it, uncapped, so a turbine condenser
     * on nine tiles of vent runs at nine. An impact reactor's is its own warmup to the
     * fifth power, and it consumes while it produces. None of that is derivable from the
     * numbers already dumped, and guessing any of it means being wrong by a factor.
     */
    private static void describeGenerator(Block block, Jval entry) {
        if (block instanceof ConsumeGenerator burner) {
            entry.put("warmup_speed", burner.warmupSpeed);
            /* How much longer one fuel lasts than the default. Pyratite burns three times
               as long in a combustion generator, phase fabric fifteen times as long in an
               RTG: a single `itemDuration` is wrong for three of the seven. */
            Jval durations = Jval.newObject();
            for (Item item : Vars.content.items()) {
                float found = burner.itemDurationMultipliers.get(item, 1f);
                if (found != 1f) durations.put(item.name, found);
            }
            if (durations.asObject().size > 0) entry.put("item_duration_multipliers", durations);
            if (burner.outputLiquid != null) {
                Jval out = Jval.newObject();
                out.put(burner.outputLiquid.liquid.name, burner.outputLiquid.amount * TPS);
                entry.put("output_liquid", out);
            }
            if (burner.explodeOnFull) entry.put("explode_on_full", true);
            /* What burning each accepted item is worth, which is the generator's output
               multiplier and not a property of the block at all: `ConsumeItemFlammable`
               hands back flammability, `ConsumeItemRadioactive` radioactivity, and the
               plain filter hands back one. Written out per item here so the simulation
               never has to know which subclass it is looking at. */
            if (burner.filterItem != null) {
                Jval worth = Jval.newObject();
                for (Item item : Vars.content.items()) {
                    if (burner.filterItem.filter.get(item)) {
                        worth.put(item.name, burner.filterItem.itemEfficiencyMultiplier(item));
                    }
                }
                if (worth.asObject().size > 0) entry.put("item_worth", worth);
            }
        }
        if (block instanceof HeaterGenerator heater) {
            entry.put("heat_output", heater.heatOutput);
            entry.put("warmup_rate", heater.warmupRate);
        }
        if (block instanceof ThermalGenerator thermal) {
            /* The ground, again, but read differently from a cultivator's: there is no cap
               at all. `productionEfficiency = sum + attribute.env()`, and nothing clamps
               it, so a three by three condenser on nine tiles of vent produces nine times
               its field. Clamping it to one is the obvious mistake and it is a ninefold
               one. */
            entry.put("attribute", thermal.attribute.name);
            entry.put("min_efficiency", thermal.minEfficiency);
            entry.put("display_efficiency_scale", thermal.displayEfficiencyScale);
            if (thermal.floating) entry.put("floating", true);
            if (thermal.outputLiquid != null) {
                Jval out = Jval.newObject();
                out.put(thermal.outputLiquid.liquid.name, thermal.outputLiquid.amount * TPS);
                entry.put("output_liquid", out);
            }
        }
        if (block instanceof ImpactReactor impact) {
            entry.put("warmup_speed", impact.warmupSpeed);
            entry.put("item_duration", impact.itemDuration);
        }
        if (block instanceof NuclearReactor nuclear) {
            /* Every one of these lives in the class body or the constructor rather than in
               the block's own initialiser, so reading `Blocks.java` finds none of them. */
            entry.put("heating", nuclear.heating);
            entry.put("coolant_power", nuclear.coolantPower);
            entry.put("ambient_cooldown_time", nuclear.ambientCooldownTime);
            entry.put("heat_output", nuclear.heatOutput);
            /* Un reacteur tient deux chaleurs : `heat` dans zero-un pour la
               surchauffe, et `heatProgress` dans zero-quinze pour ce que lisent ses
               voisins, qui rampe vers la premiere a cette vitesse. */
            entry.put("heat_warmup_rate", nuclear.heatWarmupRate);
            entry.put("item_duration", nuclear.itemDuration);
            if (nuclear.fuelItem != null) entry.put("fuel_item", nuclear.fuelItem.name);
        }
        if (block instanceof VariableReactor variable) {
            entry.put("max_heat", variable.maxHeat);
            entry.put("unstable_speed", variable.unstableSpeed);
            entry.put("warmup_speed", variable.warmupSpeed);
        }
    }


    /** The liquids a block goes faster with and runs without. */
    private static Jval boostLiquidsOf(Block block) {
        Jval boost = Jval.newObject();
        for (Consume consume : block.consumers) {
            if (consume.booster && consume instanceof ConsumeLiquid one) {
                boost.put(one.liquid.name, one.amount * TPS);
            }
        }
        return boost;
    }

    /** Every attribute a block carries, which for a cliff is how much sand is in it. */
    private static Jval attributesOf(Block block) {
        Jval out = Jval.newObject();
        for (Attribute attribute : Attribute.all) {
            float found = block.attributes.get(attribute);
            if (found != 0f) out.put(attribute.name, found);
        }
        return out;
    }


    /** Ce qui divise le temps de forage, minerai par minerai. */
    private static Jval drillMultipliersOf(arc.struct.ObjectFloatMap<Item> table) {
        Jval out = Jval.newObject();
        for (Item item : Vars.content.items()) {
            float found = table.get(item, 1f);
            if (found != 1f) out.put(item.name, found);
        }
        return out;
    }

    /** Le minerai qu'une foreuse refuse malgre son palier. */
    private static Jval blockedItemsOf(Drill drill) {
        Jval out = Jval.newArray();
        if (drill.blockedItem != null) out.asArray().add(Jval.valueOf(drill.blockedItem.name));
        return out;
    }

}
