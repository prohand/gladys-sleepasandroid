# Sleep as Android — intégration Gladys

Cette intégration amène l'application [Sleep as Android](https://sleep.urbandroid.org/) dans
Gladys : le suivi du sommeil est-il en cours, la phase de sommeil (éveillé, léger, profond,
paradoxal), le réveil qui sonne, le prochain réveil et la durée de votre nuit. Chaque événement de
l'appli peut lancer une scène Gladys : fermer les volets quand le suivi démarre, allumer doucement
la lumière quand le réveil sonne, envoyer un message quand un bébé pleure.

Nécessite **Gladys 5.3 ou plus récent**.

## Comment les événements arrivent dans Gladys

Sleep as Android pousse ses événements, Gladys n'interroge jamais le téléphone. Deux canaux,
utilisez l'un ou les deux :

| Canal       | Badge dans Gladys | Ce qu'il faut                                   | Marche hors de la maison |
| ----------- | ----------------- | ----------------------------------------------- | ------------------------ |
| **MQTT**    | local             | un broker MQTT sur votre réseau (ex. Mosquitto) | non                      |
| **Webhook** | cloud             | un abonnement Gladys Plus                       | oui                      |

Avec les deux, chaque événement arrive deux fois : l'intégration garde la première copie et ignore
l'autre. Le bouton **Préférer la connexion locale** de l'écran Configuration choisit le canal que
montre le badge de l'appareil quand les deux marchent.

## 1. Configurer l'intégration

Ouvrez **Intégrations → Sleep as Android → Configuration**.

| Champ                           | Quoi mettre                                                                                                                                 |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Dormeurs                        | Vide pour un seul téléphone. Un téléphone par personne : leurs prénoms, séparés par des virgules (`Alice, Bob`). Un appareil Gladys chacun. |
| Adresse du broker MQTT          | `mqtt://192.168.1.10:1883` (ou `mqtts://…:8883` pour TLS). L'adresse réseau du broker, **jamais `localhost`**. Vide : pas de MQTT.          |
| Utilisateur / mot de passe MQTT | Le compte du broker, s'il en demande un.                                                                                                    |
| Topic MQTT                      | `SleepAsAndroid` par défaut. Doit être le même que dans l'appli.                                                                            |
| Fuseau horaire                  | Le fuseau dans lequel le prochain réveil est écrit (`Europe/Paris`, `America/Montreal`…).                                                   |

Pour le canal cloud, collez votre **clé Open API Gladys Plus** dans le bloc **Webhooks Gladys
Plus** du même écran.

Cliquez ensuite sur **Tester la connexion** : la réponse dit quels canaux marchent et donne, pour
chaque dormeur, **le topic et l'URL exacts à saisir dans l'appli**.

## 2. Configurer Sleep as Android

### MQTT (local)

Dans l'appli : **Paramètres → Services → Automatisation → MQTT**.

- activez-le ;
- **URL** : `tcp://192.168.1.10:1883` (l'adresse du broker, avec `tcp://`, ou `ssl://` pour TLS) ;
- **Topic** : `SleepAsAndroid` pour le premier (ou le seul) dormeur, `SleepAsAndroid/bob` pour Bob ;
- **Client ID** : n'importe quoi d'unique, par exemple `telephone-bob` ;
- utilisateur et mot de passe si votre broker en demande.

L'intégration s'abonne au topic et à tous ses sous-topics. Les messages publiés avec le drapeau
_retain_ sont ignorés : ce sont d'anciens événements, les rejouer relancerait vos scènes.

### Webhook (cloud, via Gladys Plus)

Dans l'appli : **Paramètres → Services → Automatisation → Webhooks**, activez-le et collez l'URL
donnée par **Tester la connexion**. Avec plusieurs dormeurs, chaque téléphone reçoit l'URL suivie
de `?sleeper=<prénom>` (ex. `…?sleeper=bob`) ; le premier dormeur peut utiliser l'URL telle quelle.

Gardez cette URL pour vous : qui la possède peut envoyer des événements à votre place.

### Vérifier

Utilisez le bouton **Test** de l'appli (dans l'écran MQTT ou Webhooks), ou lancez un suivi du
sommeil : la fonctionnalité **Last event** de l'appareil change en quelques secondes.

## 3. Créer les appareils

**Intégrations → Sleep as Android → Découverte** : un appareil par dormeur, nommé
`Sleep as Android` (un seul téléphone) ou `Sleep as Android — Alice`. Créez-les.

| Fonctionnalité      | Valeurs                                                                                                                |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Sleep tracking      | 1 pendant le suivi, 0 à l'arrêt ou en pause                                                                            |
| Sleep phase         | 0 éveillé, 1 paradoxal (REM), 2 léger, 3 profond (plus c'est profond, plus c'est haut : un hypnogramme une fois tracé) |
| Alarm ringing       | 1 pendant que le réveil sonne, 0 une fois arrêté ou répété                                                             |
| Next alarm          | texte, ex. `2026-10-22 07:00 · Travail`, `—` s'il n'y en a pas                                                         |
| Last event          | texte, le nom brut du dernier événement (`deep_sleep`, `alarm_alert_start`…)                                           |
| Last sleep duration | heures suivies pendant la dernière session, pauses exclues                                                             |

Les états sont sauvegardés par l'intégration : un redémarrage de Gladys pendant la nuit ne perd pas
le début de la session.

Renommer un dormeur dans la configuration crée un nouvel appareil : son identifiant vient de son
prénom.

## 4. Scènes

Déclencheurs (**Quand…**), chacun avec un filtre **Dormeur** (vide = tous) :

| Déclencheur                               | Filtre                                                                                                                                                                                 | Variables                                         |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Suivi du sommeil démarré ou arrêté        | démarré, arrêté, en pause, repris                                                                                                                                                      | sleeper, state, duration_hours (à l'arrêt)        |
| Événement de réveil                       | sonne, arrêté, répétition, répétition annulée, prochain réveil sauté, reprogrammé, vérification du réveil, heure d'aller au lit, réveil bientôt, réveil intelligent bientôt / commencé | sleeper, event, alarm_time, alarm_label           |
| Phase de sommeil changée                  | éveillé, endormi, léger, profond, paradoxal                                                                                                                                            | sleeper, phase                                    |
| Son détecté pendant le sommeil            | ronflement, parole, toux, bébé qui pleure, rire, alerte respiration (apnée), anti-ronflement                                                                                           | sleeper, sound                                    |
| N'importe quel événement Sleep as Android | —                                                                                                                                                                                      | sleeper, event (nom brut), value1, value2, value3 |

Lisez une variable dans les actions suivantes avec `{{triggerEvent.data.alarm_label}}`.

Actions (**Alors…**) :

- **Lire l'état du sommeil** : met `tracking`, `phase`, `alarm_ringing`, `next_alarm`,
  `last_event` et `last_sleep_hours` d'un dormeur dans des variables — « si le suivi est en cours,
  ne pas allumer la lumière » ;
- **Réinitialiser un dormeur** : remet à éveillé, rien en cours — pour le matin où le téléphone
  s'est éteint pendant la nuit.

Exemples :

- _Quand_ Suivi du sommeil démarré (démarré) → fermer les volets de la chambre, éteindre les
  lumières.
- _Quand_ Événement de réveil (sonne) → lumière à 20 %, puis ouvrir les volets.
- _Quand_ Son détecté (bébé qui pleure) → envoyer un message aux parents.

Pour construire une scène en journée, **Simuler un événement** (écran Configuration) joue n'importe
quel événement comme si le téléphone l'avait envoyé.

## 5. Widget du tableau de bord

Ajoutez le widget **Sommeil** et choisissez un dormeur (vide : le premier). Il montre les tuiles
suivi et réveil, les douze dernières heures en hypnogramme, la phase, le prochain réveil, la durée
de la dernière nuit, par où arrivent les événements (MQTT ou Gladys Plus) et un bouton
**Réinitialiser**.

## Dépannage

- **Rien n'arrive par MQTT** : `localhost` et `127.0.0.1` désignent le conteneur de l'intégration
  lui-même, mettez l'adresse réseau du broker. **Tester la connexion** montre la réponse du broker
  (mot de passe refusé, injoignable…). Le topic de l'appli doit être celui de la configuration,
  majuscules comprises.
- **Badge « cloud » avec un point orange** : vous préférez le local, un broker est configuré mais
  injoignable, et les événements passent par Gladys Plus.
- **« Webhook indisponible »** : Gladys Plus n'est pas lié, ou la clé Open API manque dans le bloc
  Webhooks Gladys Plus.
- **Un événement pour un dormeur inconnu est ignoré** : le topic `SleepAsAndroid/<prénom>` ou le
  `?sleeper=<prénom>` doit désigner un dormeur de la configuration (majuscules et accents ne
  comptent pas).
- **Le suivi reste en cours** : le téléphone s'est éteint avant d'envoyer « suivi arrêté ». Utilisez
  **Réinitialiser** (widget ou action de scène).
