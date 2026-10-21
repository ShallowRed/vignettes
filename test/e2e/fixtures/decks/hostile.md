---
title: "Deck hostile"
status: public
theme: dsfr
lang: fr
parser: heading
storybook: "javascript:alert('storybook')"
component:
  name: a
  props:
    data-preview-link: "javascript:alert('component')"
mdc:
  components:
    span: iframe
reveal:
  dependencies:
    - src: "data:text/javascript,alert('reveal')"
---

# Deck hostile

Chaque diapositive essaie d'exécuter un script dans la page du studio.

## Cadres

::Iframe{src="javascript:alert('iframe')"}

::

::Iframe{:src="storybook"}

::

::Iframe{:src='"javascript:alert(\'bound\')"'}

::

::Iframe{src="/media/hostile.svg"}

::

::StoryFrame{story="a--b"}

::

## Mise en page

:layout{name="media-right" story="a--b"}

Le média vient du Storybook du deck.

## Liens

[lien](javascript:alert('link')) [lié]{:href="storybook"} [objet]{v-bind="component.props"}

<a data-preview-link="javascript:alert('preview')" href="#">aperçu</a>

<iframe src="/slides/composants"></iframe>

## Liaisons

{{ $route.matched.0.instances.default.$el.ownerDocument.defaultView.alert }}

:quicklink{text="Retour" :href="storybook"}
